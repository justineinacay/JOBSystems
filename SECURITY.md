# J.O.B Systems — Security Posture

Personal, private operating system for Justine Luis Inacay. This file is the honest
record of what's actually secured, what isn't yet, and exactly what to do about it.
Read it before assuming anything here is "handled."

---

## 1. Repository Access — ACTION REQUIRED (you, not me)

**Confirmed via the GitHub API on 2026-08-05: this repo is still public.**
Combined with §2 below (RLS policies are `true`), this means the data is
reachable by anyone right now, not just theoretically. This is the highest-
priority item in this file.

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
3. **Rebuild the RLS policies around real auth**, not `true`. `RLS_MIGRATION.sql`
   in this repo does this — copy-paste it into the Supabase SQL Editor and
   run it. It's idempotent (safe to re-run) and:
   - Adds a `user_id uuid references auth.users(id)` column to every table
     that doesn't already have one
   - Drops every existing policy, whatever it's named
   - Recreates select/insert/update/delete policies scoped to
     `auth.uid() = user_id`, granted only to the `authenticated` role —
     `anon` gets nothing
   - Your PIN-lock screen stays as the *app-level* lock it already is;
     Supabase Auth becomes the *data-level* lock underneath it — the two
     aren't the same thing, and only the second one actually stops someone
     with just the anon key
   - **Read the NOTE at the bottom of that file before running it** —
     every row written under the old `true` policies has `user_id = NULL`,
     which becomes invisible to everyone (including you) once the new
     policies are live. There's a commented-out backfill block to claim
     existing rows as yours; it needs your real `auth.users.id` filled in.

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

## 6. Client-side fixes applied 2026-08-05

These were done directly in code (no account credentials needed), separate
from the account-level actions in §1 and §2 above which are still pending:

- **Broken web app manifest** — was an inline `data:` URI with malformed
  JSON (`fetch().json()` threw `Unterminated string`), which meant "Add to
  Home Screen" could silently fail to register the app as installable.
  Replaced with a real `manifest.json` file plus generated `icons/icon-192.png`,
  `icons/icon-512.png`, and `icons/apple-touch-icon.png` from `logo.png`.
- **Clickjacking** — GitHub Pages can't serve `X-Frame-Options` or a
  `frame-ancestors` CSP header, and `frame-ancestors` is ignored when set
  via a `<meta>` tag, so a JS-level frame-buster was added at the top of
  `<head>` as the only available defense-in-depth on this host. A CSP
  `<meta>` tag was also added covering `object-src`, `base-uri`, and
  `form-action` (the directives that *do* work via meta). `script-src` /
  `connect-src` were deliberately left unrestricted — this app calls
  Supabase, four different AI providers, and Google Workspace, and a wrong
  CSP there would silently break those integrations without a full
  authenticated test pass. **Real protection against framing still requires
  moving off GitHub Pages** (e.g. Cloudflare Pages, which does let you set
  real response headers) — the JS check is a stopgap, not equivalent.
- **AI provider key fields** — added `autocomplete="off"` (so browsers stop
  offering to save these through the password-manager UI) and an inline
  warning in Settings stating plainly that these keys sit in this browser's
  localStorage unencrypted. This doesn't change the exposure model in §4,
  it just makes it visible to you in the UI instead of only in this file.
- **Stray console warning fixed** — `tp-date`'s default value was a
  template-literal string (`${localDateStr(new Date())}`) pasted directly
  into static HTML instead of being evaluated, so the browser rejected it
  as an invalid date format on every load. The JS that opens this field's
  modal already sets the real value correctly, so the static attribute was
  simply dead weight — removed.

None of this touches §1 (repo visibility) or §2 (RLS policies / key
rotation) — those still require you, specifically because they're account-
security actions on services only you can authenticate to.

---

*Last reviewed against the live Supabase project on the date this file was generated.
If you rotate the key or rebuild the RLS policies, update the relevant section above
rather than deleting the history of what was fixed when.*
