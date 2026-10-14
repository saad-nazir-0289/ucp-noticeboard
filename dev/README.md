# Local preview

Run the whole system on your own machine (or in a Claude Code cloud
session) with demo data, to see changes working before they go anywhere
near production. Nothing here talks to the production API or database.

## Start / stop

```bash
cd dev && npm install        # once: installs Playwright for screenshots
dev/start-local.sh --reset   # fresh demo data; drop --reset to keep it
dev/stop-local.sh
```

| What | URL |
|---|---|
| Backend API (Swagger at `/swagger`) | http://localhost:5000 |
| PWA | http://localhost:5173 |
| Extension, on a mock UCP dashboard | http://localhost:5174 |

Logs are in `dev/.run/*.log`. Requirements: .NET 8 SDK, Node 18+, and
PostgreSQL reachable as `postgres`/`postgres` on localhost (override with
`UCP_LOCAL_POSTGRES_HOST` / `_USER` / `_PASSWORD`). The preview uses its
own database, `ucp_preview`.

## Demo accounts

All privileged accounts use PIN **1234**.

| Roll Number | Role | Name |
|---|---|---|
| `L1F21BSCS0001` | Admin | Demo Admin |
| `L1F21BSCS0002` | Publisher | Computing Society |
| `L1F22BSSE0003` | Publisher | Student Affairs Office |
| `L1F23BSCS0004` … `L1F23BSCS0008` | Student | Ayesha Khan, Hamza Ali, … |

- **PWA:** enter any of these Roll Numbers on the welcome screen. To switch
  user, clear the site's storage (or use a private window).
- **Extension:** the mock portal shows Ayesha Khan by default; pick someone
  else with `?roll=…&name=…`, e.g.
  http://localhost:5174/?roll=L1F21BSCS0001&name=Demo%20Admin

The data is relative to when it was seeded (some notices due soon, some
expired), so use `--reset` to refresh it.

## The mock portal

`portal/index.html` stands in for `horizon.ucp.edu.pk/student/dashboard`.
It only reproduces what the extension relies on — the name/Roll Number
heading and the "Classes, Grades and Attendance" section it injects above —
and loads the locally built `content.js` the way Chrome would. Layout
details of the real portal (fonts, grid CSS) are approximated, so always
give a UI change a final look on the real portal via a staging build
(see `docs/STAGING.md`).

## Screenshots

```bash
node dev/screenshot.mjs <url> <out.png> [--mobile] [--as <roll>] [--full] [--selector <css>]

node dev/screenshot.mjs http://localhost:5173/ pwa.png --mobile --as L1F23BSCS0004
node dev/screenshot.mjs "http://localhost:5174/?roll=L1F21BSCS0001&name=Demo%20Admin" ext.png --selector "#ucp-noticeboard-root"
```

Console errors and failed requests from the page are printed alongside.
