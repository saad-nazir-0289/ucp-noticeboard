# UCP NoticeBoard

A Chrome extension that injects a live NoticeBoard directly into the UCP
Student Portal dashboard (`https://horizon.ucp.edu.pk/student/dashboard`),
backed by an ASP.NET Core 8 Web API and PostgreSQL.

This README explains every step in full detail — assume you've never done
any of this before. Follow it top to bottom, in order, and don't skip
sections even if they sound obvious.

---

## What this project does, in plain words

- Every student who opens the UCP dashboard automatically sees a row of
  notice "cards" (like little posters) injected right above the "Classes,
  Grades and Attendance" section. No extra login — the extension quietly
  reads the Roll Number already shown on the page (e.g. `L1S23BSCS0289`)
  and uses that as the student's identity.
- There are three kinds of people:
  - **Student** — can only look at notices. That's it.
  - **Publisher** — can create notices, and edit/delete *only the ones they
    personally created*. They cannot touch anyone else's notices.
  - **Admin** — that's you. You can add/remove Publishers, and you can
    edit/delete *any* notice, even ones you didn't create. You also get an
    Analytics tab showing how many people are using the extension.
- Notices automatically disappear after 7 days (they're not deleted from
  the database, just hidden from everyone — so nothing is permanently
  lost).
- Notice cards can have a poster image, a title, and a short description.
  They scroll sideways like a carousel — at least 4 visible at once on a
  desktop screen, fewer on a narrow/mobile screen.

---

## Part 1 — Get it running on YOUR computer first

Do this part first, always. Never skip straight to deployment — if it
doesn't work locally, it won't work deployed either, and it's much harder
to debug on a server.

### 1.1 Install the tools you need

Install these one at a time, in this order. Each link takes you to the
official download page.

1. **[.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)** — this
   is what runs the backend (the server that stores notices and users).
   After installing, open a terminal and type `dotnet --version`. If it
   prints something starting with `8.`, it worked.
2. **[Node.js 18 or newer](https://nodejs.org/)** — this is what builds the
   Chrome extension. After installing, type `node --version` in a
   terminal. It should print something like `v18.x.x` or higher.
3. **[PostgreSQL 14 or newer](https://www.postgresql.org/download/)** —
   this is the database that stores everything (users, notices). During
   installation, it will ask you to set a password for the `postgres`
   user — remember whatever you type here, you'll need it in a minute.
4. **Google Chrome** — you probably already have this.

### 1.2 Create the database

Open a terminal (Command Prompt, PowerShell, or Terminal — any of them)
and run:

```bash
psql -U postgres -c "CREATE DATABASE ucp_noticeboard;"
```

It will ask for the password you set during PostgreSQL installation. Type
it and press Enter. If you don't see any error message, it worked — a new,
empty database named `ucp_noticeboard` now exists on your computer.

> If `psql` isn't recognized as a command, PostgreSQL's `bin` folder isn't
> in your system PATH. On Windows, it's usually something like
> `C:\Program Files\PostgreSQL\16\bin` — add that folder to your PATH
> environment variable and restart your terminal.

### 1.3 Unzip the project

Unzip `UCP-NoticeBoard.zip` (the full source code zip) somewhere easy to
find, like your Desktop. You should end up with a folder called
`UCP-NoticeBoard` containing two subfolders: `backend` and `extension`.

### 1.4 Configure the backend

Open the file `backend/UCPNoticeBoard.Api/appsettings.json` in any text
editor (Notepad, VS Code, whatever you have). You'll see something like
this:

```json
{
  "InitialAdminRollNumber": "L1S23BSCS0289",
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=ucp_noticeboard;Username=postgres;Password=postgres"
  },
  "Jwt": {
    "Key": "REPLACE_THIS_WITH_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS"
  }
}
```

Change these three things:

1. **`InitialAdminRollNumber`** — put in YOUR OWN Roll Number exactly as it
   appears on your dashboard (e.g. `L1S23BSCS0289`). This is what makes
   YOU the one and only Admin the first time you open the dashboard with
   the extension installed.
2. **`Password=postgres`** inside the connection string — change
   `postgres` (the second one, after `Password=`) to whatever password you
   set for PostgreSQL in step 1.2. Leave everything else in that line
   exactly as it is.
3. **`Jwt.Key`** — replace the placeholder text with any long random
   string of at least 32 characters. This is used to cryptographically
   sign login sessions, and it should be a secret only you know. You can
   just mash your keyboard for 40 characters, or use a password generator.

Save the file.

### 1.5 Set up the database tables and start the backend

Open a terminal, navigate into the backend project folder, and run these
commands one at a time:

```bash
cd UCP-NoticeBoard/backend/UCPNoticeBoard.Api
dotnet restore
dotnet ef database update
dotnet run
```

What each command does:

- `dotnet restore` — downloads the code libraries the project needs. This
  can take a minute the first time.
- `dotnet ef database update` — creates the `Users` and `Notices` tables
  inside the `ucp_noticeboard` database you made in step 1.2. If this
  command says `dotnet ef` isn't found, run
  `dotnet tool install --global dotnet-ef` first, then try again.
- `dotnet run` — actually starts the backend server. When it's working,
  you'll see log lines ending with something like `Now listening on:
  http://localhost:5000`. **Leave this terminal window open** — closing it
  stops the server.

Leave this running in the background for the rest of these steps. Open a
**new** terminal window for anything else.

> If `dotnet ef database update` fails with an error about the migration
> not matching, it means the hand-written migration files in this project
> didn't apply cleanly on your PostgreSQL version. Fix: delete everything
> inside the `Migrations` folder, then run
> `dotnet ef migrations add InitialCreate` followed by
> `dotnet ef database update` — this regenerates the migration files
> correctly for your exact setup.

### 1.6 Build the extension

In your **new** terminal window (leave the backend one running):

```bash
cd UCP-NoticeBoard/extension
npm install
npm run build
```

- `npm install` — downloads the extension's code libraries. Takes a
  minute the first time.
- `npm run build` — compiles the extension into a `dist` folder inside
  `extension`. This `dist` folder is what Chrome actually loads.

### 1.7 Load the extension into Chrome

1. Open Chrome and go to `chrome://extensions` (type that directly into
   the address bar).
2. In the top-right corner, turn on **Developer mode** (it's a toggle
   switch).
3. Click the **Load unpacked** button that appears.
4. A file picker opens. Navigate to and select the
   `UCP-NoticeBoard/extension/dist` folder (the one `npm run build` just
   created — not the `extension` folder itself, the `dist` folder inside
   it).
5. You should now see "UCP NoticeBoard" appear as a card in your
   extensions list.

### 1.8 Try it out

1. With the backend still running (from step 1.5) and the extension
   loaded, go to `https://horizon.ucp.edu.pk/student/dashboard` and log
   into the portal as you normally would.
2. You should see a "Latest Updates" section appear automatically, right
   above "Classes, Grades and Attendance" — no button to click, no
   sign-in prompt.
3. Since your Roll Number matches `InitialAdminRollNumber` from step 1.4,
   you're automatically the Admin. You should see extra tabs: **All
   Notices**, **Manage Users**, and **Analytics**.
4. Go to **Manage Users**, and under "Add Publisher by Roll Number" add a
   classmate's Roll Number — this always adds them as a Publisher, since
   that's the only role you'd ever need to add manually. (Students never
   need to be added — they're auto-registered the moment they open the
   dashboard. If you ever want to promote someone to Admin or demote a
   Publisher back to Student, do that from the "All Users" table below the
   add form instead.)
5. Have that classmate (or you, on a second Chrome profile) open the
   dashboard — they'll see a **My Notices** tab where they can click
   **+ New Notice**, fill in a Title, Description, and an optional poster
   image (any direct image URL — e.g. right-click an image online and
   "Copy image address").
6. Go back to the main **Notices** tab — the new notice appears as the
   first card, with the poster image if one was added.

If all of that worked, everything is functioning correctly on your
machine. Now, and only now, move on to Part 2.

---

## Part 2 — Deploying so it works for every student, not just you

Right now, the backend only runs on your computer, reachable only by your
computer. To make it work for everyone, two separate things need to
happen: the backend needs a public home on the internet, and the extension
needs to reach students' Chrome browsers without them doing any manual
setup.

### 2.1 Deploy the backend to Railway

[Railway](https://railway.app) is a hosting service that runs your backend
code on the internet and can also host a PostgreSQL database for you, all
in one place, with a generous free tier — good enough for a university
project.

1. **Put the project on GitHub**, if it isn't already. Create a free
   account at [github.com](https://github.com) if you don't have one,
   create a new repository, and upload the `UCP-NoticeBoard` folder to it
   (GitHub's website has an "upload files" option if you don't want to use
   git commands).
2. Go to [railway.app](https://railway.app) and sign up using your GitHub
   account (click "Login with GitHub").
3. Click **New Project**, then **Deploy from GitHub repo**, and pick the
   repository you just created.
4. Railway will look at the repo and find `backend/Dockerfile`. This file
   tells Railway exactly how to build and run your backend — you don't
   need to write any build configuration yourself. If Railway doesn't
   automatically find it, click on the new service, go to **Settings**,
   and set **Root Directory** to `backend`.
5. Wait for the first build to finish (watch the "Deployments" tab — it
   will show build logs). This can take a few minutes the first time.
6. **Add a database**: in the same Railway project (you'll see it as a
   canvas/board with your backend service on it), click **New** →
   **Database** → **Add PostgreSQL**. Railway creates a managed Postgres
   database and automatically shows you its connection details.
7. **Connect the backend to the database and set secrets**: click on your
   backend service (not the database), go to the **Variables** tab, and
   add these one at a time (click "New Variable" for each):

   | Variable name | What to put |
   |---|---|
   | `ConnectionStrings__DefaultConnection` | Click on your Postgres service, go to its **Variables** tab, and copy `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`. Then type this into the value box, filling in the real values: `Host=<PGHOST>;Port=<PGPORT>;Database=<PGDATABASE>;Username=<PGUSER>;Password=<PGPASSWORD>` |
   | `Jwt__Key` | The same long random secret you used locally, or a new one — just make it 32+ random characters. |
   | `InitialAdminRollNumber` | Your Roll Number, same as before. |
   | `ASPNETCORE_ENVIRONMENT` | `Production` |

   Note the **double underscore** (`__`) in `ConnectionStrings__DefaultConnection`
   and `Jwt__Key` — this is not a typo. It's how ASP.NET Core reads nested
   settings (like `Jwt: { Key: ... }` in `appsettings.json`) from plain
   environment variables.

8. After saving the variables, Railway automatically restarts your
   backend with the new settings.
9. **Give it a public address**: click your backend service, go to
   **Settings → Networking**, and click **Generate Domain**. Railway gives
   you a URL like `https://ucp-noticeboard-api-production.up.railway.app`.
   This is your live backend address — write it down, you need it next.
10. **Create the database tables on the live database.** The easiest way:
    on your own computer, temporarily edit
    `backend/UCPNoticeBoard.Api/appsettings.Development.json` to add the
    same `ConnectionStrings.DefaultConnection` value you used in Railway
    (pointing at Railway's Postgres instead of your local one), then run
    `dotnet ef database update` from your terminal one more time. This
    applies the same table-creation migration, just against the Railway
    database instead of your laptop's. Afterwards, you can remove that
    temporary edit — you won't need it again unless you change the data
    model in the future.

### 2.2 Point the extension at the live backend

1. Open `extension/src/api/client.ts` in a text editor and find this line
   near the top:
   ```ts
   const API_BASE_URL = "http://localhost:5000";
   ```
   Change it to your Railway URL from step 2.1.9:
   ```ts
   const API_BASE_URL = "https://ucp-noticeboard-api-production.up.railway.app";
   ```
2. Open `extension/manifest.json` and find the `host_permissions` section:
   ```json
   "host_permissions": [
     "https://horizon.ucp.edu.pk/*",
     "http://localhost:5000/*"
   ]
   ```
   Replace the `localhost` line with your Railway domain:
   ```json
   "host_permissions": [
     "https://horizon.ucp.edu.pk/*",
     "https://ucp-noticeboard-api-production.up.railway.app/*"
   ]
   ```
3. Rebuild the extension:
   ```bash
   cd extension
   npm run build
   ```
4. Go back to `chrome://extensions`, find the UCP NoticeBoard card, and
   click the refresh/reload icon on it (or remove it and "Load unpacked"
   again, pointing at the same `dist` folder). It's now talking to your
   live backend instead of your laptop.

### 2.3 Publish the extension to the Chrome Web Store (so others don't need Developer Mode)

Right now, only people who manually "Load unpacked" can use the extension
— that requires turning on Developer Mode, which is intimidating for most
students and not something you can ask hundreds of people to do.
Publishing to the Chrome Web Store fixes that: students click one button
("Add to Chrome") and it just works.

We'll publish it as **Unlisted**, meaning it doesn't show up in public
Chrome Web Store search results — only people with the direct link can
install it. This is faster to get approved than a fully public listing.

1. Go to the [Chrome Web Store Developer
   Dashboard](https://chrome.google.com/webstore/devconsole) and sign in
   with any Google account.
2. The first time, it will ask you to pay a **one-time $5 registration
   fee** — this is a Google-wide anti-spam measure, not a subscription.
3. Prepare the package: go into `extension/dist` and select all 3 files
   inside it (`manifest.json`, `content.js`, `icon128.png`), then zip
   **just those files** (not the `dist` folder itself — the `manifest.json`
   must be at the top level of the zip, not nested inside a folder).
4. Back in the Developer Dashboard, click **New Item**, and upload the zip
   you just made.
5. Fill in the required listing fields:
   - **Name**: UCP NoticeBoard
   - **Description**: a sentence or two about what it does.
   - **Icon**: you can reuse `extension/public/icon128.png`, though a
     nicer custom icon looks more professional.
   - **Screenshot**: take a screenshot of the dashboard with the
     NoticeBoard visible (screenshots are required by the Store).
   - **Category**: pick "Productivity" or similar.
6. Under the **Visibility** / **Distribution** settings, choose
   **Unlisted**.
7. Click **Submit for review**. Review usually takes anywhere from a few
   hours to a few days. You'll get an email when it's approved.
8. Once approved, open the item's Store page and copy its URL — it looks
   like `https://chromewebstore.google.com/detail/<some-id>`. Share this
   link with students (post it in a class WhatsApp group, on a notice
   board, wherever). They click it, click **Add to Chrome**, and they're
   done — no Developer Mode, no unzipping, nothing technical required.

> **Updating later:** whenever you change the extension's code, run
> `npm run build` again, zip the new `dist` contents the same way, and
> upload it as a new version from the same Developer Dashboard item. Chrome
> auto-updates it on everyone's browser within a day or so — you never
> need to ask students to reinstall.

---

## Troubleshooting

**"Couldn't detect your Roll Number on this page"** — the portal's layout
doesn't match what the extension is looking for. Open
`extension/src/content/studentIdentity.ts`, and check the
`ROLL_NUMBER_REGEX` pattern against what your actual Roll Number looks
like. Rebuild after any change.

**The NoticeBoard doesn't appear at all** — open
`extension/src/content/index.tsx` and check `SECTION_HEADING_TEXT`
matches the exact wording of a heading on your dashboard (currently
`"Classes, Grades and Attendance"`). If no match is found anywhere on the
page, the board falls back to appearing at the very bottom of the page
instead of failing silently — so check there too.

**"Couldn't reach the NoticeBoard server"** — either the backend isn't
running (check your `dotnet run` terminal for errors), or `API_BASE_URL`
in `extension/src/api/client.ts` doesn't match where the backend actually
lives, or (if deployed) `host_permissions` in `manifest.json` doesn't
include that domain.

**A Publisher can't edit a notice** — this is by design if it's not their
own notice. Only the original creator (or the Admin) can edit/delete a
given notice.

**Someone is seeing tabs/permissions that don't match their current
role** — the extension re-identifies you fresh on every single page load
(it does not cache your session), specifically so role changes made by
the Admin take effect immediately, the very next time that person reloads
the dashboard. If this ever happens again, it means the identification
step itself is failing to find the right person — check
`extension/src/content/studentIdentity.ts`.

**The NoticeBoard appears at the very top of the page instead of above
"Classes, Grades and Attendance"** — `findInjectionAnchor()` in
`extension/src/content/index.tsx` grabbed too large an ancestor element.
It's tuned to this portal's actual UIkit-based markup (elements with
classes like `uk-width-large-3-10`), but if the portal's structure changes,
re-inspect the page and adjust the selector there.

**Notices are missing after a week** — also by design: anything older
than 7 days is automatically hidden everywhere. The data isn't deleted
from the database, just filtered out of every screen. If you want a
different expiry length, change `NoticeLifetime` in
`backend/UCPNoticeBoard.Api/Controllers/NoticesController.cs`.

---

## Project structure

```
UCP NoticeBoard/
  README.md
  extension/                     Chrome Extension (MV3, React, TS, Vite)
    manifest.json
    src/
      content/                   Injected UI: entry point, root component,
                                  Roll Number identity scraper
      components/                NoticeFeed, NoticeCard, NoticeDetailModal,
                                  NoticeManager (Publisher's own / Admin's all),
                                  AdminPanel (user management), AnalyticsPanel
      api/                       Backend API client
      types/                     Shared TypeScript types
  backend/                       ASP.NET Core 8 Web API
    Dockerfile                    Multi-stage build for Railway/any container host
    UCPNoticeBoard.sln
    UCPNoticeBoard.Api/
      Controllers/                AuthController, UsersController,
                                   NoticesController, AnalyticsController
      Models/                     User, Notice, DTOs
      Data/                       AppDbContext
      Services/                   JwtTokenService
      Migrations/                 InitialCreate, AddImageAndAnalytics
      Program.cs
      appsettings.json
```

## API summary

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/login` | none | Identifies/creates a user by Roll Number. New Roll Numbers default to Student unless they match `InitialAdminRollNumber`. |
| GET | `/users` | Admin | List all users. |
| POST | `/users` | Admin | Add a user by Roll Number with a chosen role. |
| PATCH | `/users/{id}/role` | Admin | Change a user's role. |
| GET | `/notices` | any identified user | Notices from the last 7 days, newest first. |
| GET | `/notices/{id}` | any identified user | Single notice. |
| POST | `/notices` | Publisher, Admin | Creates a notice (with optional poster image URL) owned by the caller. |
| PUT | `/notices/{id}` | Publisher (own only), Admin (any) | Edit a notice. |
| DELETE | `/notices/{id}` | Publisher (own only), Admin (any) | Delete a notice. |
| POST | `/analytics/visit` | any identified user | Records one dashboard view. Called automatically every page load. |
| GET | `/analytics/summary` | Admin | User counts by role, total views, active-in-last-7-days. |
