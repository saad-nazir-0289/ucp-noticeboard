# Staging environment

Staging is a complete second copy of UCP NoticeBoard (backend, database, PWA
and extension) that you can click through on your own phone and laptop
before anything reaches real students. It shares nothing with production
except the code.

|  | Production | Staging |
|---|---|---|
| Git branch | `main` | `staging` |
| Backend | Railway, existing service | Railway, separate service/environment |
| Database | production Postgres | its own Postgres, filled with demo data |
| PWA | https://ucp-noticeboard.msndev.workers.dev | https://ucp-noticeboard-staging.msndev.workers.dev |
| Extension | Chrome Web Store | unpacked build, "UCP NoticeBoard (Staging)" |

**The flow:** work happens on a feature branch → merge into `staging` →
test on the staging site and extension → merge into `main` → production.
Database migrations run on staging first, so a broken migration shows up
there instead of on real data.

> For quick checks while developing, the local preview (`dev/README.md`) is
> faster and free. Staging is for testing yourself on real devices, and on
> the real UCP portal.

---

## One-time setup

You'll do these steps in the Railway and Cloudflare dashboards. Exact
button names drift over time; the settings that matter are spelled out.

### 1. Create the `staging` branch

On GitHub, create a branch named `staging` from `main` (or ask Claude to
do it). Railway will deploy the staging backend from this branch.

### 2. Backend on Railway

In your existing Railway project, either create a new **environment** called
`staging` (Railway's Environments feature: each environment has its own
copies of the services and variables), or add a second service next to the
production one. Then:

1. **Database:** add a new **PostgreSQL** database for staging. Never point
   staging at the production database.
2. **API service source:** the same GitHub repo, **branch `staging`**, with
   **Root Directory `backend`** (that's where the Dockerfile lives). Railway
   detects the Dockerfile automatically.
3. **Variables** on the staging API service:

   | Variable | Value |
   |---|---|
   | `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | references to the **staging** Postgres, e.g. `${{Postgres.PGHOST}}` |
   | `Jwt__Key` | a **new** random secret, at least 32 characters |
   | `AdminActivationSecret` | a **new** random secret |
   | `Cors__AllowedOrigins` | `https://horizon.ucp.edu.pk,https://ucp-noticeboard-staging.msndev.workers.dev` |
   | `Pwa__BaseUrl` | `https://ucp-noticeboard-staging.msndev.workers.dev` |
   | `SeedDemoData` | `true` |

   Generate secrets with `openssl rand -base64 48`. **Never reuse the
   production `Jwt__Key`**: tokens signed with it would be accepted by
   production too.

   Optional, only if you want to test those features on staging:
   - `VapidSettings__PublicKey` / `VapidSettings__PrivateKey` /
     `VapidSettings__Subject`: push notifications. Use a separate key pair
     (`npx web-push generate-vapid-keys`), so staging can never notify
     production subscribers. Without these, push is skipped quietly.
   - `Cloudinary__CloudName` / `Cloudinary__ApiKey` / `Cloudinary__ApiSecret`:
     image uploads. Reusing the production Cloudinary account works; staging
     uploads will simply appear in it too.
4. **Domain:** under the service's networking settings, generate a public
   domain. Note the URL (e.g. `https://ucp-noticeboard-api-staging.up.railway.app`);
   the PWA and extension need it below.
5. Deploy. On first start the API migrates the empty staging database and
   fills it with demo data. Check `https://<staging-api>/health` shows
   `{"status":"ok"}`.

### 3. PWA on Cloudflare

`pwa/wrangler.jsonc` has a `staging` environment that deploys as a
**separate Worker** (`ucp-noticeboard-staging`) from its own build folder
(`dist-staging/`), so it can't overwrite the live site.

```bash
cd pwa
echo "VITE_API_BASE_URL=https://<your-staging-api>" > .env.staging.local
npm run build:staging            # → dist-staging/, pointed at the staging API
npx wrangler deploy --env staging
```

`.env.staging.local` is git-ignored. The staging build refuses to run if
`VITE_API_BASE_URL` isn't set, so it can never quietly use production.

> **Check:** this repo's `wrangler.jsonc` names the production Worker
> `ucp-noticeboard-pwa`, but the live site is at `ucp-noticeboard.msndev.workers.dev`.
> If you deploy production through the Cloudflare dashboard's Git
> integration, or under a different name, set staging up the same way
> instead: a second Worker that builds the `staging` branch with
> `npm run build:staging`, deploys `dist-staging`, and has the build variable
> `VITE_API_BASE_URL` set to the staging API.

### 4. Extension (staging build in your own Chrome)

```bash
cd extension
cat > .env.staging.local <<'EOF'
VITE_API_BASE_URL=https://<your-staging-api>
VITE_PWA_BASE_URL=https://ucp-noticeboard-staging.msndev.workers.dev
EOF
npm run build:staging            # → dist-staging/
```

Then in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Turn off** the Chrome Web Store version of UCP NoticeBoard. Both
   versions target the same page and only one can show, so the store
   version would hide the staging one.
3. Click **Load unpacked** and pick the `extension/dist-staging` folder.
   It shows up as **"UCP NoticeBoard (Staging)"**.
4. Open the real UCP portal dashboard. The board you see now comes from
   staging, and you are logged in as your real Roll Number on the
   **staging** database.

When you're done testing, turn the store version back on and remove or
disable the staging one.

Store releases are unaffected: `npm run build` (production) still writes
only to `extension/dist/`, which is what gets zipped for the Chrome Web
Store, and staging builds never touch that folder.

---

## Testing a change on staging

1. Merge the change into `staging` and push. Railway redeploys the backend
   automatically.
2. Rebuild and redeploy the PWA (`npm run build:staging && npx wrangler deploy --env staging`).
3. Rebuild the extension (`npm run build:staging`), then click the reload
   icon on "UCP NoticeBoard (Staging)" in `chrome://extensions`.
4. Try it out:
   - **PWA:** open the staging URL on your phone and enter a demo Roll
     Number. You can also install it to the home screen as a separate
     staging app.
   - **Extension:** use it on the real portal, as yourself.

### Demo accounts on staging

The same ones as the local preview. All privileged accounts use PIN `1234`:

| Roll Number | Role |
|---|---|
| `L1F21BSCS0001` | Admin |
| `L1F21BSCS0002`, `L1F22BSSE0003` | Publisher |
| `L1F23BSCS0004` … `L1F23BSCS0008` | Student |

The staging site is reachable by anyone who has its URL, and these
credentials are in a public repo, so keep only test content on staging.
Logging in with your own Roll Number through the extension makes you a
Student on staging; to test Publisher/Admin features as yourself, promote
your account with the demo Admin.

### Fresh demo data

The demo data is only inserted into an empty database. To reset staging:
wipe the staging Postgres (or delete and recreate it in Railway) and
redeploy the API. **Only ever do this on the staging database.**

## Cost

Staging adds a second always-on Railway service and database to your
Railway bill. The Cloudflare Worker and the extension cost nothing extra.
If cost matters, you can pause or delete the staging service between
testing sessions; it comes back with fresh demo data on the next deploy.
