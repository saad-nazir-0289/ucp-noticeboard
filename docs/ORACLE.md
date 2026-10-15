# Running NoticeBoard on Oracle Cloud

One free Oracle server runs the API and its database. The websites stay
where they are:

| On the Oracle server | Stays where it is |
|---|---|
| The API + its database | The PWA (Cloudflare) |
| Caddy: HTTPS, certificates renewed automatically | The extension (Chrome Web Store) |
| Nightly backups, automatic security updates | Cloudinary (posters) |

Everything on the server lives in `/opt/ucpnb` and runs in Docker. The
scripts in `deploy/oracle/` do the work; you never type Docker commands.

**The order:** create the server (A) → a web address for it (B) → set it
up (C) → its settings (D) → a test website (E) → test with a copy of the
real data (F) → release day: it becomes production (G) → automatic deploys
and backups (H).

Railway keeps running, untouched, until the very end.

---

## A. Create the server (Oracle Cloud console)

1. **The network first** (the server form's own "create network" option
   often fails): ☰ → Networking → Virtual cloud networks → **Start VCN
   Wizard** → *Create VCN with Internet Connectivity* → name `ucpnb-vcn` →
   Next → Create.
2. **Open the web ports** on the same page: Security → **Default Security
   List for ucpnb-vcn** → Security rules → *Add Ingress Rules*: source
   `0.0.0.0/0`, TCP, destination port **80**; *+ Another Ingress Rule*, the
   same for **443**. Keep the existing port 22 rule.
3. **The server:** ☰ → Compute → Instances → **Create instance**.
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: **VM.Standard.A1.Flex** (Ampere) if Oracle has capacity; free
     accounts in Mumbai usually get *out of capacity*, so use **Specialty
     and previous generation → VM.Standard.E2.1.Micro**. Either must say
     *Always Free-eligible*. On the 1 GB server the setup adds swap and the
     API runs lean; deploys just take longer (about 10 minutes).
   - Networking: *Select existing virtual cloud network* → `ucpnb-vcn`,
     *Select existing subnet* → the **public** one, and **Automatically
     assign public IPv4 address: on**.
   - SSH keys: *Generate a key pair for me* → **Download private key**.
   - Storage: leave as it is. Create.
4. When it shows **Running**, copy the **Public IP address** (instance page
   → Instance access, or the Public IP column in the list).

## B. A web address for the API (DuckDNS, free)

HTTPS needs a name, not just an IP. (Cloudflare could do this only for a
domain you own; if you buy one later, switching is small.)

1. Sign in at **duckdns.org** (with Google or GitHub).
2. Add a subdomain, e.g. `ucpnb-api`, and set it to the server's IP.
3. Note the **token** at the top of the page (keep it private).

## C. Set up the server

Log in from your computer (Windows: PowerShell; Mac: Terminal):

```bash
ssh -i <path to the downloaded key> ubuntu@<public IP>
```

(Windows: if it says *UNPROTECTED PRIVATE KEY FILE*, run
`icacls <key> /inheritance:r` and `icacls <key> /grant:r "$($env:USERNAME):(R)"`.
Mac: `chmod 600 <key>` first.)

On the server:

```bash
curl -fsSL https://raw.githubusercontent.com/saad-nazir-0289/ucp-noticeboard/staging/deploy/oracle/setup.sh -o setup.sh
sudo bash setup.sh --api-domain ucpnb-api.duckdns.org --duckdns-token <your token>
```

It installs Docker and automatic security updates, opens the server's own
firewall for the web, adds swap on small servers, downloads the code,
creates the settings with fresh secrets, schedules nightly backups, and
makes a restricted key for GitHub. Running it again is safe.

Then **log out and back in** (`exit`, then the ssh command again).

## D. The API's settings

```bash
/opt/ucpnb/repo/deploy/oracle/fill-settings.sh
```

It asks for each value in turn: copy it from Railway (your API service →
Variables), right-click to paste, Enter. Using Railway's VAPID keys keeps
everyone's notifications working after the move. (To edit the file by hand
instead: `nano /opt/ucpnb/config/production.env`; save with Ctrl+O, Enter,
Ctrl+X.)

## E. A test website

In Cloudflare, create a second Worker from this GitHub repository (the same
way the production one was made):

- branch **`staging`**
- build command: `cd pwa && npm ci && npm run build:staging`
- output / assets directory: `pwa/dist-staging`
- build variable: `VITE_API_BASE_URL` = `https://ucpnb-api.duckdns.org`

Note its address (e.g. `https://ucp-noticeboard-staging.<you>.workers.dev`)
and add it to the end of `Cors__AllowedOrigins` in `production.env`
(comma, no spaces). I build a matching test extension, which you load in
Chrome (`chrome://extensions` → Developer mode → Load unpacked) after
turning the store version off.

## F. Test with a copy of the real data

```bash
/opt/ucpnb/repo/deploy/oracle/deploy.sh production origin/staging
/opt/ucpnb/repo/deploy/oracle/copy-railway-data.sh production --test
```

The first builds and starts the API (check
`https://ucpnb-api.duckdns.org/health` shows `{"status":"ok"}`). The second
asks for Railway's database address: Railway → the **Postgres** service →
**Variables** → `DATABASE_PUBLIC_URL` (paste; the input is hidden and isn't
saved). It copies Railway's data in and, because of `--test`, removes
everyone's notification subscriptions and unlocked devices, so nothing you
do while testing reaches real students. The API then brings the data up to
date: likes removed, old categories folded into the nine fixed ones.

Test everything on the test website and extension: your real notices,
users and categories, logging in as yourself, posting, sharing,
notifications (subscribe on your own phone), installing the app.

New code to test? After it's on the `staging` branch, run the `deploy.sh`
line again. Want fresh data? Run the copy line again.

## G. Release day: the server becomes production

Do it in one sitting.

1. **Freeze Railway's code.** Railway → the API service → Settings: turn
   off automatic deploys from GitHub.
2. **Tell publishers** not to post for the next half hour.
3. **Copy the real data, this time keeping subscriptions:**
   ```bash
   /opt/ucpnb/repo/deploy/oracle/copy-railway-data.sh production
   ```
4. **Switch the apps** (I prepare this; you merge): merging into `main`
   points the PWA at the new API; Cloudflare redeploys it by itself. Then
   run `/opt/ucpnb/repo/deploy/oracle/deploy.sh production` so the server
   runs exactly what's on `main`.
5. **Publish the extension update** to the Chrome Web Store. It asks
   students for no new permissions.
6. **While the store reviews it** (hours to a few days), students still on
   the old extension read from Railway. Ask publishers to post only from the
   app during that time: anything posted to Railway now won't come across.
7. **A week later:** take one last Railway backup and delete the Railway
   project. The test website can be deleted too (and removed from
   `Cors__AllowedOrigins`).

Before step 3, if `Pwa__BaseUrl` in `production.env` still points at the
test website (set while testing, so shared links open it), put it back to
`https://ucp-noticeboard.msndev.workers.dev`.

**If something goes wrong** before step 7: revert the merge on GitHub (the
PWA goes back to Railway by itself) and don't publish the extension;
Railway still has everything.

## H. Automatic deploys and backups (GitHub, after release)

Repository → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `ORACLE_HOST` | the server's public IP |
| `ORACLE_SSH_KEY` | the key setup.sh made: on the server, `cat ~/.ssh/github_actions`, copy everything including the BEGIN/END lines |
| `BACKUP_PASSPHRASE` | a long random passphrase; save it in a password manager, without it backups can't be opened |

From then on, after the tests pass, every push to `main` deploys to the
server automatically. That key can only deploy a commit or stream a backup;
anything else is refused. A version that doesn't start is replaced by the
previous one automatically. (Add these only after release, or a push to
`main` would replace the code you're testing.)

Backups: the server keeps 14 nightly copies in `/opt/ucpnb/backups`, and
GitHub keeps 30 days of encrypted copies (Actions → Database backup).

---

## Everyday tasks (on the server)

| What | Command |
|---|---|
| Deploy by hand | `/opt/ucpnb/repo/deploy/oracle/deploy.sh production` (optionally a branch or commit) |
| See what's running | `docker ps` |
| The API's logs | `docker logs --tail 100 ucpnb-api-production-1` |
| Back up now | `/opt/ucpnb/repo/deploy/oracle/backup.sh production` |
| Restore a backup | see below |

**Restoring** (example: last night's backup):

```bash
cd /opt/ucpnb/repo/deploy/oracle && . common.sh && load_stack_env
compose stop api-production
pg_tools psql --host db --username postgres -c "DROP DATABASE ucpnb_production WITH (FORCE);" -c "CREATE DATABASE ucpnb_production;"
pg_tools pg_restore --host db --username postgres --no-owner -d ucpnb_production < /opt/ucpnb/backups/production-<date>.dump
compose up -d api-production
```

A GitHub backup is decrypted first: `gpg --decrypt file.dump.gpg > file.dump`.

**A separate staging API** is still possible later: run setup.sh again with
`--staging-domain <another DuckDNS name>`, fill in
`/opt/ucpnb/config/staging.env`, and `deploy.sh staging`.

## Troubleshooting

- **`/health` doesn't load at all:** the web ports aren't open. Check the
  security list rules (A.2); setup.sh handles the server's own firewall.
- **"502":** the API isn't running. `docker logs ucpnb-api-production-1`
  usually says why (often a typo or a leftover `RAILWAY` in its `.env`).
- **Certificate errors:** the DuckDNS name doesn't point at the server yet,
  or the ports are closed. Caddy retries by itself once it's fixed.
- **The server's IP changed:** with `--duckdns-token`, the name follows it
  within 10 minutes; also update `ORACLE_HOST` on GitHub.
