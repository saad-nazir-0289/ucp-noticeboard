# Privacy Policy — UCP NoticeBoard

**Last updated:** August 2026

This document explains what UCP NoticeBoard collects, why, and what happens to it — across both the Chrome extension and the standalone mobile-friendly site (the "PWA"). It's written to match exactly what the code actually does, not generic boilerplate.

## Important: this is an independent student project

UCP NoticeBoard is **not** an official product of, or affiliated with, endorsed by, or operated on behalf of the University of Central Punjab (UCP). It is a personal/student-built tool that integrates with the public-facing UCP Student Portal. Any resemblance in visual styling to the portal is for a consistent user experience only, not a claim of official status. This remains true regardless of how the extension is discovered — including via public listing on the Chrome Web Store.

## What information is collected

**Identity:**
- Your Roll Number
- Your Name

**How these two are obtained differs by which surface you use:**
- **Chrome extension**: your Roll Number and Name are read directly off the already-authenticated UCP Student Portal page — nothing is typed in, nothing is asked.
- **Standalone site (PWA)**: since it isn't embedded in the portal, you enter your Roll Number once, the first time you use it on a given device. That device then remembers it — you're never asked again. The PWA does **not** ask for your name at all; if you're a brand-new account created this way, your display name simply defaults to your Roll Number until an Admin corrects it (see "Security measures" below for why names work this way).

**Created by using either surface:**
- An account role (Student, Publisher, or Admin)
- Account creation date
- The last time you opened the dashboard, and a running count of how many times you have (used only to show the Admin aggregate usage numbers — e.g. "42 total views this week" — never a per-person activity log visible to anyone but the Admin's aggregate totals)
- If you're a Publisher or Admin: the notices you create (title, description, optional poster image, optional external link, optional category, optional deadline)
- Which notices you've personally hidden from your own feed ("dismissed") — this is private to you; it doesn't affect what anyone else sees
- If you opt into notifications: a push subscription for that specific device (see "Push notifications" below)

**Not collected, ever:**
- Passwords (there is no password — see "How you're identified" below)
- Email addresses
- Browsing activity outside the dashboard/site
- Location data
- Any information from a device or browser beyond what's needed to identify you and, if you choose, send you notifications

## How you're identified — no separate account or password, on either surface

Neither the extension nor the PWA has a traditional sign-in screen. Both rely on your Roll Number as your identity — the extension reads it automatically off your authenticated portal session; the PWA asks you to type it once. Either way:
- No password of yours is ever seen, stored, or handled by this project.
- A Roll Number alone only ever grants ordinary read-only (Student) access.
- Publisher or Admin access requires a separate one-time secret link, issued individually by the Admin — never granted by the Roll Number alone.

## Push notifications

If you choose to enable notifications (a clearly separate, opt-in action — never on by default), your browser creates a **push subscription**: a set of technical identifiers (an endpoint address and encryption keys) that let a notice be delivered to that specific device, even when the app isn't open. This is a standard browser feature (not something built by this project) — the actual delivery is routed through your browser vendor's own push infrastructure (e.g. Google's, for Chrome), the same mechanism any website's notifications use.

- Notifications currently contain only a notice's title and a short excerpt of its description — nothing else about your account is included in a notification.
- You can disable notifications at any time from the same button used to enable them.
- If a device's subscription becomes invalid (e.g. the app was uninstalled, browser data was cleared), it's automatically detected and removed the next time a notification fails to deliver to it — no manual cleanup needed on your part.
- Push notifications are sent to every subscribed device when a new notice is published — there's no per-topic or per-category targeting.

## Where your data is stored

- **Application data** (accounts, notices, categories, dismissal records, push subscriptions) is stored in a PostgreSQL database hosted on Railway (railway.app), a third-party cloud hosting provider.
- **Poster images**, if a Publisher/Admin adds one, are hosted on Cloudinary (cloudinary.com), a third-party image hosting provider. Uploaded images are typically publicly accessible via their hosted URL — the same way any image URL posted in a notice would be.
- No data is stored on your own device beyond what your browser needs to run the extension or PWA normally, and (for the PWA) your Roll Number itself, saved locally so you aren't asked for it again.

None of these third parties (Railway, Cloudinary, or browser push infrastructure) is authorized to use this data for their own purposes — they are infrastructure providers only, storing and delivering what this project sends them.

## What this data is used for

- Showing you the right notices, filtered to what's currently active
- Determining what you're allowed to do (view only, publish, or administer) based on your role
- Delivering notifications to devices that have opted in
- Letting the Admin see aggregate usage numbers (total users, total views, active-in-last-7-days) to understand whether the tool is actually being used
- Letting a Publisher/Admin manage the notices they're responsible for

This data is **not** sold, rented, or shared with any third party for advertising, marketing, or any purpose beyond operating this project. There are no ad networks, analytics trackers, or data brokers involved anywhere in this project.

## How long data is kept

- **Notices**: automatically hidden from the student-facing feed once their deadline passes (or, if no deadline was set, 7 days after posting) — but **not deleted**. A Publisher/Admin can still review, edit, or manually delete them from the management view at any time. Nothing is silently erased by the passage of time.
- **Accounts** (Roll Number, Name, Role, usage stats): kept for as long as the service operates, since role assignments (e.g. Publisher access) need to persist across visits.
- **Dismissed notices**: kept until the underlying notice itself expires or is deleted, at which point the dismissal record naturally has nothing left to refer to.
- **Push subscriptions**: kept until you disable notifications, or automatically removed once detected as no longer valid.

## Your choices

- **Viewing notices** requires no action or consent step beyond visiting the dashboard/site — this is the intended zero-friction design.
- **Hiding a notice** ("dismissing" it) is fully reversible from the "Hidden Notices" panel at any time.
- **Notifications** are entirely opt-in and can be turned off at any time, on a per-device basis.
- **Requesting removal of your account data**: contact the Admin (see below) and ask for your account to be removed. Since Roll Numbers are how the university itself identifies students, removing your record here doesn't affect anything on the actual UCP portal — only within this project.

## Security measures in place

- All communication with the backend happens over HTTPS.
- Access to Publisher/Admin capabilities requires a one-time secret link, not just knowledge of a Roll Number — Roll Numbers are visible on the portal and can be sequential/guessable between classmates, so they're never treated as sufficient proof of identity on their own.
- A display name is only ever trusted at the exact moment an account is first created. After that, no request — from anyone — can silently change it; only an Admin can correct a name afterward. This specifically prevents someone from renaming another student just by guessing their Roll Number.
- Session tokens are short-lived and re-issued fresh on every visit rather than cached indefinitely.
- Rate limiting is in place to reduce the impact of abuse or misbehaving clients hitting the backend.

No system is perfectly secure, and this is a small student-run project without a dedicated security team — if you discover a vulnerability, please report it responsibly to the contact below rather than exploiting it.

## Children's privacy

This tool is intended for use by university students and staff and is not directed at children. It is not knowingly used to collect data from anyone under the age required to be enrolled at a university.

## Changes to this policy

If what this project collects or how it's used changes, this document will be updated accordingly, and the "Last updated" date at the top will change to reflect that.

## Contact

For questions about this policy, to request your data be removed, to report a security concern, or to leave feedback:

**Muhammad Saad Nazir**
GitHub: [github.com/saad-nazir-0289](https://github.com/saad-nazir-0289)
