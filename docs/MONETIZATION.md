# Covering the running costs

NoticeBoard has one "Sponsored" spot in the **PWA feed** that can help pay
for the servers. It is **off** until you configure it, and it only ever
appears in the PWA — never in the extension.

## Where it appears

- In the PWA feed, after the 3rd notice and then after every 8th (card view
  and list view), clearly labelled **Sponsored** or **Support**.
- The account sheet also gets a "Support NoticeBoard" link when a support
  URL is set, and so does the extension's header (a plain link, not an ad).

**Why not in the extension:** it runs inside the university's own portal.
Showing ads inside a page you don't own is restricted by Google's
Chrome Web Store policies (ads must be disclosed and must not interfere with
the host site), and it would put the extension's standing with the
university at risk. A small support link is fine.

## Option 1 — Your own "Support" card (works today, no approval needed)

Set a link to wherever people can chip in (a donation page, JazzCash /
Easypaisa details page, Buy Me a Coffee, a Google Form for sponsors, …):

```bash
# PWA (and optionally the extension) build environment
VITE_SUPPORT_URL=https://your-support-page.example
```

The feed then shows a "Keep NoticeBoard free" card with a **Support** button.

**Selling the slot to a sponsor** (a local business, a society, a training
institute) is often worth more than ad networks for a small, local
audience. Point `VITE_SUPPORT_URL` at a page describing the sponsorship, or
ask for the slot to show a specific sponsor's card — that's a small change.

## Option 2 — Google AdSense

1. **Get a domain you own** (around $10/year), and point it at the PWA in
   Cloudflare. AdSense rarely approves free subdomains such as
   `*.workers.dev`; it wants a site on your own domain.
2. Apply at [adsense.google.com](https://adsense.google.com) with that domain
   and wait for approval (it checks for real content and a privacy policy).
3. Create an **In-feed** ad unit; note the publisher ID (`ca-pub-…`) and
   the slot ID.
4. Add an `ads.txt` file to `pwa/public/` with the line AdSense gives you.
5. Build the PWA with:

   ```bash
   VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
   VITE_ADSENSE_SLOT=1234567890
   ```

   When both are set, the sponsored slot shows the AdSense unit (it takes
   priority over the support card).
6. **Update `Privacy.md` before going live** — it currently says there are
   no ad networks. Replace that sentence and add a section like:

   > **Advertising.** The NoticeBoard website (not the browser extension)
   > shows ads served by Google AdSense. Google and its partners use
   > cookies to serve ads based on your visits to this and other sites. You
   > can opt out of personalised advertising at
   > [adssettings.google.com](https://adssettings.google.com). NoticeBoard
   > does not share your Roll Number or any account data with advertisers.

**Expectations:** ad revenue depends on traffic and audience location. For
a campus audience in Pakistan it is likely to be small (often well under a
dollar per thousand views), so a direct sponsor or a support link may cover
costs sooner.
