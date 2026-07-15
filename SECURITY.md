# J.O.B Systems — Security Posture

Personal, private operating system for Justine Luis Inacay. This file is the honest
record of what's actually secured, what isn't yet, and exactly what to do about it.
Read it before assuming anything here is "handled."

---

## 1. Repository Access — ACTION REQUIRED (you, not me)

This repo must be **private**. If it isn't already:

1. `github.com/justineinacay/JOBSystems` → **Settings** → scroll to **Danger Zone**
2. **Change visibility** → **Change to private** → type the repo name to confirm
3. Settings → **Collaborators and teams** → confirm the list is empty or only
   people you explicitly trust with this data

**Important limitation:** going private stops *new* people from finding this repo.
It does **not** revoke access for anyone who already cloned it, forked it, or has
a cached copy of a raw file URL from when it may have been public. If this repo
was ever public, treat any key that was ever committed to it as burned — rotating
the key (below) is what actually closes that door, not the visibility toggle alone.

---

## 2. Supabase — the part that actually matters most

**Current state, verified directly against the live project:**

- Row Level Security is *enabled* on every table — but every policy is
  `USING (true)` / `WITH CHECK (true)` for the `anon` role. In plain terms:
  RLS being "on" here is cosmetic. Anyone holding the anon key can read and
  write every row in every table — tasks, cashflow, memories, health logs,
  faith activities, client data, everything.
- The anon key currently embedded in `index.html` (`SB_KEY`) is the
  **same key that has been in this file since early in development**. If
  the repo was ever public, or if anyone has a copy of this file from any
  point in its history, that key still works right now.

**What needs to happen, in order:**

1. **Rotate the key** (you, via Supabase Dashboard → your project →
   Settings → API → JWT Settings → *Generate new JWT secret*). This is a
   security-setting change — deliberately not something done on your
   behalf even with tool access. It invalidates the old key immediately.
2. Send me the new anon key → I drop it into `index.html` in one line.
3. **Rebuild the RLS policies around real auth**, not `true`. This means:
   - Add Supabase Auth (email/password or magic link — your call)
   - Every table's policies become `auth.uid() = user_id` (or equivalent)
     instead of blanket `true`
   - Your PIN-lock screen stays as the *app-level* lock it already is;
     Supabase Auth becomes the *data-level* lock underneath it — the two
     aren't the same thing, and only the second one actually stops someone
     with just the anon key

Until step 3 is done, step 1 is a stopgap, not a fix — a new leaked key
would be exactly as exposed as the old one, just newer.

---

## 3. Google OAuth — what's public vs. what's secret

- `GOOGLE_OAUTH_CLIENT_ID` is embedded in `index.html`. **This is fine and
  expected** — OAuth client IDs are not secrets; Google's own docs treat
  them as public identifiers, same category as a Supabase project URL.
- `GOOGLE_OAUTH_CLIENT_SECRET` lives in a Cloudflare Worker's encrypted
  variable storage, deployed separately (see `DEPLOY_OAUTH_PROXY.md`) —
  never in this file, never in git. The static app calls the Worker,
  the Worker calls Google with the secret attached, and the app never
  sees or holds the secret at any point.
- **Why a proxy instead of just PKCE:** Google's OAuth requires the client
  secret for the token exchange on "Web application"-type clients
  regardless of PKCE — PKCE alone wasn't sufficient for this client type,
  confirmed by the `client_secret is missing` error the app hit before
  this proxy was added.
- Token refresh is now silent — the proxy makes it possible without
  exposing the secret client-side, so reconnecting manually is no longer
  needed when a token expires (this was a known limitation of the earlier
  PKCE-only design, now resolved).

---

## 4. AI Provider Keys (Claude / Gemini / OpenAI)

All stored in `localStorage`, entered by you directly in Settings, never
committed to this repo. Same exposure model as the Supabase key: anyone
with access to your browser's localStorage on this device has them.
Standard tradeoff for a backend-less personal app — not a gap unique to
this project, just worth knowing.

---

## 5. What "private repo" does and doesn't cover

| Threat | Private repo helps? |
|---|---|
| Someone finds your repo via GitHub search | Yes |
| Someone already has a clone/fork from before | No |
| Someone has the anon key from any past version | No — only key rotation fixes this |
| Someone accesses your Supabase data directly | No — only real RLS policies fix this |
| Someone opens your deployed GitHub Pages site | Depends — Pages sites can be public even if the repo is private, depending on your Pages settings. Check Settings → Pages if you don't want the *live app* reachable by URL either, separately from the repo. |

---

*Last reviewed against the live Supabase project on the date this file was generated.
If you rotate the key or rebuild the RLS policies, update the relevant section above
rather than deleting the history of what was fixed when.*
