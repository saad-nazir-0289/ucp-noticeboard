# Privacy Policy — UCP NoticeBoard

**Last updated:** August 2026

This document explains what UCP NoticeBoard collects, why, and what happens to it. It's written to match exactly what the code actually does — not generic boilerplate.

## Important: this is an independent student project

UCP NoticeBoard is **not** an official product of, or affiliated with, endorsed by, or operated on behalf of the University of Central Punjab (UCP). It is a personal/student-built tool that integrates with the public-facing UCP Student Portal. Any resemblance in visual styling to the portal is for a consistent user experience only, not a claim of official status.

## What information is collected

**From the UCP Student Portal page itself** (read directly off the page, not entered by you):
- Your Roll Number
- Your Name

Nothing else is read from the portal. No password, no grades, no attendance, no course data, and no portal session/cookie information is ever accessed or transmitted.

**Created by using the extension:**
- An account role (Student, Publisher, or Admin)
- Account creation date
- The last time you opened the dashboard, and a running count of how many times you have (used only to show the Admin aggregate usage numbers — e.g. "42 total views this week" — never a per-person activity log visible to anyone but you and the Admin's aggregate totals)
- If you're a Publisher or Admin: the notices you create (title, description, optional poster image link, optional external link, optional category, optional deadline)
- Which notices you've personally hidden from your own feed ("dismissed") — this is private to you; it doesn't affect what anyone else sees

**Not collected, ever:**
- Passwords (there is no password — see "How you're identified" below)
- Email addresses
- Browsing activity outside the dashboard page
- Location data
- Any information from a device or browser beyond what's needed to show the Roll Number already visible on the portal page

## How you're identified — no separate login

UCP NoticeBoard doesn't have a sign-in screen. It reads the Roll Number already displayed on your authenticated UCP portal session and uses that as your identity, on the reasoning that the portal itself has already verified who you are. This means:
- No password of yours is ever seen, stored, or handled by this extension.
- A bare Roll Number only ever grants ordinary read-only (Student) access.
- Publisher or Admin access requires a separate one-time secret link, issued individually by the Admin — never granted by the Roll Number alone.

## Where your data is stored

- **Application data** (accounts, notices, categories, dismissal records) is stored in a PostgreSQL database hosted on Railway (railway.app), a third-party cloud hosting provider.
- **Poster images**, if a Publisher/Admin uploads one, are hosted on Cloudinary (cloudinary.com), a third-party image hosting provider. Uploaded images are typically publicly accessible via their hosted URL — the same way any image URL you post in a notice would be.
- No data is stored on your own device beyond what your browser needs to run the extension normally.

Neither Railway nor Cloudinary is authorized to use this data for their own purposes — they are infrastructure providers only, storing and serving what this app sends them.

## What this data is used for

- Showing you the right notices, filtered to what's currently active
- Determining what you're allowed to do (view only, publish, or administer) based on your role
- Letting the Admin see aggregate usage numbers (total users, total views, active-in-last-7-days) to understand whether the tool is actually being used
- Letting a Publisher/Admin manage the notices they're responsible for

This data is **not** sold, rented, or shared with any third party for advertising, marketing, or any purpose beyond operating this extension. There are no ad networks, analytics trackers, or data brokers involved anywhere in this project.

## How long data is kept

- **Notices**: automatically hidden from the student-facing feed once their deadline passes (or, if no deadline was set, 7 days after posting) — but **not deleted**. A Publisher/Admin can still review, edit, or manually delete them from the management view at any time. Nothing is silently erased by the passage of time.
- **Accounts** (Roll Number, Name, Role, usage stats): kept for as long as the service operates, since role assignments (e.g. Publisher access) need to persist across visits.
- **Dismissed notices**: kept until the underlying notice itself expires or is deleted, at which point the dismissal record naturally has nothing left to refer to.

## Your choices

- **Viewing notices** requires no action or consent step beyond visiting the dashboard — this is the intended zero-friction design.
- **Hiding a notice** ("dismissing" it) is fully reversible from the "Hidden Notices" panel at any time.
- **Requesting removal of your account data**: contact the Admin (see below) and ask for your account to be removed. Since Roll Numbers are how the university itself identifies students, removing your record here doesn't affect anything on the actual UCP portal — only within this extension.

## Security measures in place

- All communication with the backend happens over HTTPS.
- Access to Publisher/Admin capabilities requires a one-time secret link, not just knowledge of a Roll Number.
- Session tokens are short-lived and re-issued fresh on every dashboard visit rather than cached indefinitely.
- Rate limiting is in place to reduce the impact of abuse or misbehaving clients hitting the backend.

No system is perfectly secure, and this is a small student-run project without a dedicated security team — if you discover a vulnerability, please report it responsibly to the contact below rather than exploiting it.

## Children's privacy

This tool is intended for use by university students and staff and is not directed at children. It is not knowingly used to collect data from anyone under the age required to be enrolled at a university.

## Changes to this policy

If what this extension collects or how it's used changes, this document will be updated accordingly, and the "Last updated" date at the top will change to reflect that.

## Contact

For questions about this policy, to request your data be removed, or to report a security concern, contact:

**Muhammad Saad Nazir**
GitHub: [github.com/saad-nazir-0289](https://github.com/saad-nazir-0289)