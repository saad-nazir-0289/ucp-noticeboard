# Running NoticeBoard on Oracle Cloud

One free Oracle server runs everything except the websites themselves:

| On the Oracle server | Stays where it is |
|---|---|
| Production API + its database | The PWA (Cloudflare, production and staging Workers) |
| Staging API + its database | The extension (Chrome Web Store / your own Chrome for staging) |
| Caddy: HTTPS for both, certificates renewed automatically | Cloudinary (posters) |
| Nightly backups, automatic security updates | |

Everything on the server lives in `/opt/ucpnb` and runs in Docker. The
scripts that set it up and run it are in `deploy/oracle/`; you never have
to type Docker commands yourself.

**The order:** create the server (A–C) → staging on it, with demo data (D)
→ automatic deploys and backups (E) → rehearse with a copy of the real
data (F) → move production (G) → switch Railway off.

---

## A. Create the server (Oracle Cloud console)

1. **Compute → Instances → Create instance.**
   - **Image:** Canonical **Ubuntu 24.04**.
   - **Shape:** *Ampere* → **VM.Standard.A1.Flex**, 1–2 OCPUs and 6–12 GB
     memory (all inside Always Free). If Oracle says *out of capacity*
     (common in Mumbai on free accounts), pick **Specialty and previous
     generation → VM.Standard.E2.1.Micro** instead (AMD, 1 GB, also Always
     Free). The setup adds 3 GB of swap and the APIs run with a small memory
     footprint, so both fit; deploys just take longer.
   - **Networking:** keep "Assign a public IPv4 address" on.
   - **SSH keys:** "Generate a key pair for me" → **download the private
     key** and keep it safe; it's how you log in.
2. **Open the web ports.** Instance page → the **subnet** link → its
   **security list** → *Add ingress rules*, twice:
   source `0.0.0.0/0`, TCP, destination port **80**; and the same for **443**.
3. **Note the public IP address** on the instance page.
4. **Keep it free and running.** Oracle may reclaim Always Free servers
   that look idle; NoticeBoard is idle most of the day. Upgrading the
   account to **Pay As You Go** stops that while Always Free resources stay
   free. If you do, set a **budget alert** (Billing → Budgets) at about $1,
   so you'd hear about any charge long before it mattered.

## B. Names for the two APIs (DuckDNS, free)

HTTPS needs a name, not just an IP address.

1. Sign in at **duckdns.org** (with Google or GitHub).
2. Add two subdomains, for example `ucpnb-api` and `ucpnb-staging`, and
   set both to the server's public IP.
3. Note the **token** shown at the top of the page.

You now have `ucpnb-api.duckdns.org` (production) and
`ucpnb-staging.duckdns.org` (staging). Send me these two names (they're
not secret): I set them in the PWA and extension builds.

## C. Set up the server

On your computer, log in (use the key you downloaded):

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<public IP>
```

On the server:

```bash
curl -fsSL https://raw.githubusercontent.com/saad-nazir-0289/ucp-noticeboard/staging/deploy/oracle/setup.sh -o setup.sh
sudo bash setup.sh --api-domain ucpnb-api.duckdns.org --staging-domain ucpnb-staging.duckdns.org --duckdns-token <your token>
```

It installs Docker and automatic security updates, opens the server's own
firewall for the web, adds swap on small servers, downloads the code,
creates the settings with fresh passwords and secrets, schedules nightly
backups, and makes a restricted key for GitHub. Running it again is safe.

Then **log out and back in** (`exit`, then the ssh command again).

## D. Staging, with demo data

1. **The staging website.** In Cloudflare, create a second Worker from this
   GitHub repository (the same way the production one was made):
   - branch **`staging`**
   - build command: `cd pwa && npm ci && npm run build:staging`
   - output / assets directory: `pwa/dist-staging`
   - build variable: `VITE_API_BASE_URL` = `https://ucpnb-staging.duckdns.org`

   Note its address, e.g. `https://ucp-noticeboard-staging.<you>.workers.dev`.
2. **Staging's settings** on the server:
   ```bash
   nano /opt/ucpnb/config/staging.env
   ```
   Replace both `STAGING_PWA_URL` with that address. Save (Ctrl+O, Enter,
   Ctrl+X).
3. **Start staging:**
   ```bash
   /opt/ucpnb/repo/deploy/oracle/deploy.sh staging
   ```
   The first build takes a few minutes. Check
   `https://ucpnb-staging.duckdns.org/health` shows `{"status":"ok"}` (the
   first visit can take a few seconds while the certificate is issued).
4. **The staging extension:** I build it with the staging address; you
   load it in Chrome (`chrome://extensions` → Developer mode → Load
   unpacked), after turning the store version off.
5. **Try everything.** Demo accounts (PIN `1234`): Admin `L1F21BSCS0001`,
   publishers `L1F21BSCS0002` and `L1F22BSSE0003`, students
   `L1F23BSCS0004` to `L1F23BSCS0008`. On a phone: install the app, share
   from WhatsApp into it, notifications, Desktop site mode.

## E. Automatic deploys and backups (GitHub)

Repository → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `ORACLE_HOST` | the server's public IP |
| `ORACLE_SSH_KEY` | the key setup.sh made: on the server, `cat ~/.ssh/github_actions`, copy everything including the BEGIN/END lines |
| `BACKUP_PASSPHRASE` | a long random passphrase; save it in a password manager, without it backups can't be opened |

From then on, after the tests pass, pushes to `staging` deploy staging and
pushes to `main` deploy production, automatically. That key can only do
two things on the server (deploy a commit, stream a backup); anything else
is refused. A new version that doesn't start properly is replaced by the
previous one automatically.

Backups: the server keeps 14 nightly copies in `/opt/ucpnb/backups`, and
GitHub keeps 30 days of encrypted copies (Actions → Database backup).

## F. Rehearse with the real data (on staging)

Before touching production, try the move on staging with a copy of
today's Railway data:

```bash
/opt/ucpnb/repo/deploy/oracle/copy-railway-data.sh staging
```

It asks for Railway's database address: Railway → the **Postgres** service
→ **Variables** → `DATABASE_PUBLIC_URL` (copy, paste; the input is hidden
and isn't saved anywhere). It copies Railway's database, backs up staging,
puts the copy in, removes everyone's notification subscriptions and
unlocked devices (so staging can never reach real students), and starts
staging on it. The API then brings the data up to date: likes removed,
old categories folded into the nine fixed ones, the new columns added.

Check on the staging site and extension: your real notices, users and
categories, logging in as yourself, your PIN.

(Tested here on a copy of the current production structure with old-style
data: categories like "Non-Tech Event" land in Events, "Hackathons" in
Competitions, unmatched ones lose their category, and existing PINs keep
working.)

## G. Moving production (release day)

The order matters; do it in one sitting.

1. **Freeze Railway's code.** Railway → the API service → Settings: turn
   off automatic deploys from GitHub. (Otherwise merging into `main` would
   also upgrade Railway mid-move.)
2. **Production settings** on the server:
   ```bash
   cp /opt/ucpnb/config/production.env.example /opt/ucpnb/config/production.env
   nano /opt/ucpnb/config/production.env
   ```
   Replace every `RAILWAY` with the value from Railway → the API service →
   Variables (same names, with `__`). Keeping the same VAPID keys keeps
   everyone's notifications working.
3. **Start production empty, then copy the data in:**
   ```bash
   /opt/ucpnb/repo/deploy/oracle/deploy.sh production
   /opt/ucpnb/repo/deploy/oracle/copy-railway-data.sh production
   ```
   Tell publishers not to post during this (it takes minutes). Then check
   `https://ucpnb-api.duckdns.org/health` and the counts it prints.
4. **Switch the apps** (I prepare this; you merge): merging into `main`
   points the PWA at the new API (Cloudflare redeploys it by itself) and
   deploys the same code to Oracle production.
5. **Publish the extension update** to the Chrome Web Store (new version,
   built with the new address). It asks students for no new permissions.
6. **While the store reviews it** (hours to a few days), students still on
   the old extension read from Railway. Ask publishers to post only from the
   app during that time: anything posted to Railway now won't come across.
7. **A week later**, once almost everyone has the new extension: take one
   last backup of Railway (GitHub backup with `BACKUP_DATABASE_URL`, or the
   copy script into staging) and delete the Railway project.

**If something goes wrong:** the old setup is untouched until step 7.
Revert the merge on GitHub (the PWA goes back to Railway by itself) and
don't publish the extension; Railway still has everything.

---

## Everyday tasks (on the server)

| What | Command |
|---|---|
| Deploy by hand | `/opt/ucpnb/repo/deploy/oracle/deploy.sh staging` (or `production`, optionally a commit id) |
| See what's running | `docker ps` |
| An API's logs | `docker logs --tail 100 ucpnb-api-production-1` |
| Back up now | `/opt/ucpnb/repo/deploy/oracle/backup.sh production` |
| Restore a backup | see below |

**Restoring** (example: last night's production backup):

```bash
cd /opt/ucpnb/repo/deploy/oracle && . common.sh && load_stack_env
compose stop api-production
pg_tools psql --host db --username postgres -c "DROP DATABASE ucpnb_production WITH (FORCE);" -c "CREATE DATABASE ucpnb_production;"
pg_tools pg_restore --host db --username postgres --no-owner -d ucpnb_production < /opt/ucpnb/backups/production-<date>.dump
compose up -d api-production
```

A GitHub backup is decrypted first: `gpg --decrypt file.dump.gpg > file.dump`.

## Troubleshooting

- **`/health` doesn't load at all:** the web ports aren't open. Check the
  security list rules (A.2); setup.sh handles the server's own firewall.
- **"502":** that API isn't running. `docker logs ucpnb-api-staging-1`
  usually says why (often a typo in its `.env` file).
- **Certificate errors:** the DuckDNS name doesn't point at the server yet,
  or the ports are closed. Caddy retries by itself once it's fixed.
- **The server's IP changed:** with `--duckdns-token`, the names follow it
  within 10 minutes; also update `ORACLE_HOST` on GitHub.
