import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

type ScheduleKey = "daily_brief" | "weekly_review";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function manilaDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays)).toISOString().slice(0, 10);
}

function cleanRows(rows: Record<string, unknown>[] | null, fields: string[]) {
  return (rows ?? []).map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null])));
}

async function buildContext(supabase: ReturnType<typeof createClient>, userId: string, scheduleKey: ScheduleKey) {
  const today = manilaDate();
  const startDate = scheduleKey === "weekly_review" ? manilaDate(-6) : today;
  const [{ data: tasks }, { data: events }, { data: notes }, { data: cashflow }] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", userId).limit(80),
    supabase.from("cal_events").select("*").eq("user_id", userId).gte("date", startDate).limit(80),
    supabase.from("notes").select("*").eq("user_id", userId).limit(20),
    supabase.from("cashflow").select("*").eq("user_id", userId).gte("date", startDate).limit(80),
  ]);
  const openTasks = cleanRows((tasks ?? []).filter((task: Record<string, unknown>) => task.status !== "Done"), ["id", "title", "status", "priority", "due", "world", "client", "notes"]);
  return JSON.stringify({
    timezone: "Asia/Manila",
    today,
    schedule: scheduleKey,
    open_tasks: openTasks.slice(0, 30),
    events: cleanRows(events as Record<string, unknown>[] | null, ["id", "title", "date", "time", "endTime", "type", "world", "loc"]).slice(0, 24),
    recent_notes: cleanRows(notes as Record<string, unknown>[] | null, ["id", "title", "content", "world", "updated_at", "created_at"]).slice(0, 8),
    cashflow: cleanRows(cashflow as Record<string, unknown>[] | null, ["id", "date", "description", "desc", "amount", "type", "world"]).slice(0, 30),
  });
}

function instructionsFor(scheduleKey: ScheduleKey) {
  if (scheduleKey === "daily_brief") return "You are J.E.L.I.X., the calm private intelligence layer of a personal operating system. Create a concise midnight Manila daily brief from the supplied private data. Start with the single most useful focus for the new day, then list upcoming commitments, deadlines or open loops, and one gentle next step. Use clear headings and bullet points. Do not claim actions were taken. If data is missing, say so briefly. Keep it under 300 words.";
  return "You are J.E.L.I.X., the calm private intelligence layer of a personal operating system. Create a concise Sunday 10 PM Manila weekly review from the supplied private data. Include progress or wins, unresolved work, the most important focus for next week, and any meaningful schedule or money signals found in the data. Use clear headings and bullet points. Do not claim actions were taken. If data is missing, say so briefly. Keep it under 400 words.";
}

async function createBrief(scheduleKey: ScheduleKey, context: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, store: false, instructions: instructionsFor(scheduleKey), input: `Private dashboard context:\n${context}` }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "OpenAI request failed");
  const text = payload?.output_text ?? payload?.output?.flatMap((item: Record<string, unknown>) => item.content ?? []).map((part: Record<string, unknown>) => part.text ?? "").join("\n").trim();
  if (!text) throw new Error("OpenAI returned no brief");
  return { text, requestId: payload?.id ?? null };
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "unauthorized" }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !OPENAI_API_KEY) return json({ error: "scheduler is not configured" }, 503);
  const body = await req.json().catch(() => ({}));
  const scheduleKey = body?.schedule_key as ScheduleKey;
  if (scheduleKey !== "daily_brief" && scheduleKey !== "weekly_review") return json({ error: "invalid schedule key" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: schedules, error } = await supabase.from("jelix_schedules").select("id,user_id,schedule_key").eq("schedule_key", scheduleKey).eq("enabled", true);
  if (error) return json({ error: "unable to load schedules" }, 500);

  const results: Record<string, string>[] = [];
  for (const schedule of schedules ?? []) {
    const { data: run, error: runError } = await supabase.from("jelix_schedule_runs").insert({ schedule_id: schedule.id, user_id: schedule.user_id, schedule_key: schedule.schedule_key, status: "running", model: OPENAI_MODEL }).select("id").single();
    if (runError || !run) { results.push({ schedule_id: schedule.id, status: "failed" }); continue; }
    try {
      const context = await buildContext(supabase, schedule.user_id, scheduleKey);
      const brief = await createBrief(scheduleKey, context);
      await Promise.all([
        supabase.from("jelix_schedule_runs").update({ status: "completed", completed_at: new Date().toISOString(), output: brief.text, request_id: brief.requestId }).eq("id", run.id),
        supabase.from("jelix_schedules").update({ last_run_at: new Date().toISOString(), last_status: "completed", updated_at: new Date().toISOString() }).eq("id", schedule.id),
      ]);
      results.push({ schedule_id: schedule.id, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "brief generation failed";
      await Promise.all([
        supabase.from("jelix_schedule_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message }).eq("id", run.id),
        supabase.from("jelix_schedules").update({ last_run_at: new Date().toISOString(), last_status: "failed", updated_at: new Date().toISOString() }).eq("id", schedule.id),
      ]);
      results.push({ schedule_id: schedule.id, status: "failed" });
    }
  }
  return json({ ok: true, schedule_key: scheduleKey, results });
});
