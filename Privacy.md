# Privacy Policy — UCP NoticeBoard

**Last updated: October 15, 2026**

This document explains what UCP NoticeBoard collects, why it collects it, and how the information is handled across both the Chrome extension and the standalone mobile-friendly website (the “PWA”). It is intended to reflect the application's actual implementation, not generic boilerplate.

## Important: This Is an Independent Student Project

UCP NoticeBoard is **not an official product of, affiliated with, endorsed by, or operated on behalf of the University of Central Punjab (UCP)**. It is an independent, student-built tool that integrates with the public-facing UCP Student Portal. Any resemblance in visual styling to the portal is intended solely to provide a consistent user experience and does not imply official status. This remains true regardless of how the extension is discovered, including through its public Chrome Web Store listing.

## What Information Is Collected

### Identity

- Your Roll Number
- Your Name, where available

How these are obtained depends on which version you use:

- **Chrome extension:** Your Roll Number and Name are read directly from your already-authenticated UCP Student Portal page. You do not need to enter them manually.
- **Standalone website (PWA):** You enter your Roll Number once when first using the application on a device. It is saved locally so you do not need to enter it again. The PWA does not ask for your name. For a new account created this way, your display name defaults to your Roll Number until an Admin corrects it.

### Information Created Through Use of Either Version

- Your account role: Student, Publisher, or Admin.
- Account creation date.
- The last time you opened the dashboard and a running count of dashboard visits. These are used to provide the Admin with aggregate usage statistics, such as total views and recently active users, rather than a per-person activity history.
- If you are a Publisher or Admin, the notices you create, including their titles, descriptions, optional poster images, external links, categories, and deadlines.
- Notices you have archived from your own feed. These records are private to your account and do not affect what other users see.
- If you enable notifications, a push subscription associated with that device.
- If you unlock Publisher access through the Chrome extension, your Roll Number and a server-issued sign-in token, as described in **Chrome Extension Storage** below.

### Not Collected

UCP NoticeBoard does not intentionally collect:

- Your UCP portal password.
- Your email address.
- Browsing activity outside the dashboard or the information required to integrate with the UCP Student Portal.
- Location data.
- Unrelated device or browser information beyond what is needed to operate the application and, if you opt in, deliver notifications.

## How You're Identified — No Traditional Account or Password

Neither the extension nor the PWA provides a traditional username-and-password sign-in system. Both use your Roll Number as your application identity.

- The extension reads your Roll Number from your authenticated UCP Student Portal session.
- The PWA asks you to enter your Roll Number once on each device where it is first used.
- UCP NoticeBoard does not see, collect, or store your UCP portal password.
- A Roll Number alone grants ordinary read-only Student access.
- Publisher or Admin privileges require a separate authorization process using a PIN or one-time secret link, as applicable to the interface. These privileges are not granted merely by knowing a Roll Number.

## Chrome Extension Storage

The Chrome extension uses `chrome.storage.local` for one specific purpose: **remembering that a Publisher has unlocked posting access on a particular computer**.

When a Publisher, such as a university office or student society, enters their PIN to unlock posting access, the extension saves the following information locally:

- The Publisher's Roll Number.
- A sign-in token issued by the UCP NoticeBoard server.

This allows the Publisher to create, edit, and delete notices without entering the PIN every time. The saved token is removed when the Publisher locks the device or signs out.

The extension uses its own `chrome.storage.local` storage rather than the UCP Student Portal page's storage. This helps prevent scripts running in the portal page from directly reading the saved Publisher token.

**Students who only read notices do not have Publisher credentials saved through this mechanism.** The extension does not use this storage for browsing history or unrelated personal information.

The locally saved token is an authentication credential. Anyone who gains access to an active, unlocked Publisher session or obtains the token may potentially be able to exercise the associated privileges until the token is invalidated or expires. Publishers should lock the extension or sign out when leaving a shared computer unattended.

## Push Notifications

Notifications are optional and are never enabled by default. If you opt in, your browser creates a push subscription consisting of technical identifiers, including an endpoint address and encryption keys, that allow notifications to reach that device.

This is a standard browser capability. Delivery is routed through the browser vendor's push infrastructure, such as Google's infrastructure for Chrome.

- Notifications contain a notice's title and a short excerpt of its description, not additional account details.
- You can disable notifications at any time using the same control used to enable them.
- Invalid subscriptions are automatically removed when a notification delivery failure identifies them as invalid.
- When a new notice is published, notifications are sent to subscribed devices. Notifications are not currently targeted by individual topic or category.

## Where Your Data Is Stored

- **Application data:** Accounts, notices, categories, dismissal records, and push subscriptions are stored in a PostgreSQL database hosted by Railway (railway.app), a third-party cloud hosting provider.
- **Poster images:** Images uploaded by Publishers or Admins are hosted on Cloudinary (cloudinary.com), a third-party image hosting provider. These images may be publicly accessible through their hosted URLs.
- **Chrome extension:** Publisher Roll Numbers and server-issued sign-in tokens are stored locally using `chrome.storage.local` for the purpose described above.
- **PWA:** Your Roll Number is saved locally by the application so you do not need to enter it again on that device.

Other data may be temporarily processed or cached as required for normal browser and application operation.

Railway, Cloudinary, and browser push infrastructure are used to operate the service. Their handling of information is subject to their respective service terms and privacy practices; UCP NoticeBoard does not authorize these providers to use application data for unrelated purposes.

## What This Data Is Used For

Your information is used to:

- Display relevant notices that are currently active.
- Determine your application permissions.
- Deliver notifications to devices that have opted in.
- Provide the Admin with aggregate usage statistics, including total users, total views, and users active within the last seven days.
- Allow Publishers and Admins to manage the notices they are responsible for.
- Maintain Publisher authorization across visits on a computer where the extension has been unlocked.

Your data is **not sold, rented, or shared with third parties for advertising or marketing purposes**. UCP NoticeBoard does not intentionally use advertising networks, analytics trackers, or data brokers.

## How Long Data Is Kept

- **Notices:** A notice is automatically hidden from the student-facing feed after its deadline passes or, if no deadline is specified, seven days after publication. It is not automatically deleted. Authorized Publishers and Admins can review, edit, or manually delete notices through the management interface.
- **Accounts:** Roll Numbers, names, roles, and usage statistics are retained while the service operates because role assignments and application functionality depend on them.
- **Dismissed notices:** Records are retained until the underlying notice expires or is deleted, after which the dismissal record no longer has an active notice to reference.
- **Push subscriptions:** Retained until notifications are disabled or the subscription is detected as invalid.
- **Publisher credentials in extension storage:** The locally saved Roll Number and sign-in token are removed when the Publisher locks the device or signs out. Server-side token validity is subject to the server's authentication and expiration rules.

## Your Choices

- **Viewing notices:** You can view notices by visiting the dashboard or using the extension without a separate account-registration or consent process.
- **Hiding notices:** You can reverse a dismissal through the Hidden Notices panel.
- **Notifications:** You can enable or disable notifications on each subscribed device.
- **Publisher access:** Publishers can lock the extension or sign out to remove their locally saved Publisher credentials.
- **Requesting data removal:** Contact the project Admin to request removal of your account data. Removing your account from UCP NoticeBoard does not change your student record or account on the official UCP Student Portal.

## Security Measures

The project implements the following safeguards:

- HTTPS is used for communication with the backend.
- Publisher and Admin access requires a separate authorization mechanism rather than a Roll Number alone.
- Display names are trusted only when an account is first created. Subsequent name changes require Admin intervention, preventing someone from renaming another student simply by guessing their Roll Number.
- Session tokens are short-lived and reissued on visits rather than cached indefinitely.
- Rate limiting helps reduce abuse and excessive requests to the backend.
- Publisher credentials are stored in the extension's isolated `chrome.storage.local` storage rather than in the portal page's own storage.

No system is perfectly secure. UCP NoticeBoard is a small, student-run project without a dedicated security team. If you discover a vulnerability, please report it responsibly through the contact information below rather than exploiting it.

## Children's Privacy

UCP NoticeBoard is intended for university students and staff and is not directed at children. The project does not knowingly seek to collect information from children below the age required for university enrollment.

## Changes to This Policy

If the information collected, the application's functionality, or the way data is used changes, this policy will be updated accordingly. The date at the top will indicate the latest revision.

## Contact

For questions about this policy, requests to remove account data, security reports, or feedback, contact:

**Muhammad Saad Nazir**

GitHub: https://github.com/saad-nazir-0289
