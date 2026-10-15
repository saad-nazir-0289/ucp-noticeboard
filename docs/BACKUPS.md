# Backups and uptime checks

Two scheduled GitHub Actions look after the live system. Both stay off
until you give them what they need, and both only run from `main`.

## Nightly database backup (`.github/workflows/backup.yml`)

Every night at 02:17 (Pakistan time) the production database is dumped,
encrypted with your passphrase, and kept for 30 days under the
**Actions → Database backup** run as a downloadable file. The encryption
matters: anyone who can see the repository can see workflow files, so
the backup is unreadable without the passphrase.

**Turn it on** — repository **Settings → Secrets and variables → Actions
→ New repository secret**:

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | Only while on Railway: Postgres service → *Variables* → `DATABASE_PUBLIC_URL`. On the Oracle server, set `ORACLE_HOST` and `ORACLE_SSH_KEY` instead (see `ORACLE.md`, section E); the backup then streams over SSH and the database stays private. |
| `BACKUP_PASSPHRASE` | A long random passphrase. **Save a copy in your password manager** — without it no backup can be opened. |

Then run it once by hand: **Actions → Database backup → Run workflow**,
and check the run has a file attached.

**Restore** (on any machine with PostgreSQL tools installed):

```bash
gpg --decrypt ucp-noticeboard-2026-10-14.dump.gpg > backup.dump   # asks for the passphrase
pg_restore --clean --if-exists --no-owner --dbname "postgres://…target database…" backup.dump
```

Restore into a fresh or staging database first to check it, before ever
pointing it at production. Moving to a new host works the same way: restore
the latest backup into the new database.

## Hourly uptime check (`.github/workflows/uptime.yml`)

Calls the API's `/health` address every hour. If the API is down or can't
reach its database, the run fails and GitHub emails you.

**Turn it on** — **Settings → Secrets and variables → Actions →
Variables → New repository variable**: `HEALTH_URL` =
`https://ucp-noticeboard-api-production.up.railway.app/health` (or the new
host's address after a move). Only set it after the release that adds
`/health`, or every check will fail.

Make sure **Settings → Notifications → Actions** on your GitHub account
emails you about failed workflows. GitHub pauses scheduled workflows in a
repository with no activity for 60 days; a push or re-enabling it in the
Actions tab starts them again.

## Tests on every change (`.github/workflows/ci.yml`)

Every pull request runs the backend tests, the PWA tests and both builds.
Cloudflare publishes `main` to students as soon as it changes, so wait for
the green tick before merging.
