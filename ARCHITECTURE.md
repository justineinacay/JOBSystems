# J.O.B Systems source structure

J.O.B Systems remains a static PWA that can run directly on GitHub Pages. The
application does not require a framework, package installation, or build step.

## Entry point

- `index.html` contains the document shell, views, dialogs, and small early
  boot guards that must execute before the interface is painted.
- Large CSS and JavaScript blocks are loaded as ordered external assets instead
  of being embedded in the HTML file.

## Core styles

- `app-shell-01.css` and `app-shell-02.css` contain the original application
  shell and component styles.
- `app-boot.css` contains the boot-screen animation.
- `app-jelix-01.css` and `app-jelix-02.css` contain J.E.L.I.X. interface styles.
- `app-dark-theme.css` contains the final dark product theme.
- `app-job-command-center.css` contains Job Collectives command-center styles.
- Existing workspace and responsive styles remain in their dedicated files.

## Core runtime

`app-prelude.js` contains the small date and debounce utilities needed by
top-level initializers in multiple runtime sections. The `app-part-01.js`
through `app-part-07.js` files are classic scripts loaded
in their original order. They preserve the existing shared global scope while
keeping each source file below approximately 3,000 lines. This is the safe
first stage before converting individual features into isolated ES modules.

- `pwa-runtime.js` handles service-worker registration and install prompts.
- `jelix-auto-scheduler.js` contains the J.E.L.I.X. scheduling helper.
- `ui-runtime.js` contains the final interface-coherence behaviors.
- `mobile-viewport.js` contains mobile viewport and safe-area handling.

## Offline behavior

`sw.js` precaches the complete local application shell, including all extracted
assets. Supabase requests remain network-first so task, calendar, and financial
data are not silently served from stale caches.

## Re-running the migration

`scripts/modularize_index.py` records the deterministic extraction process used
for this refactor. It is intended for repository history and auditing; do not
run it again against an already modularized `index.html`.
