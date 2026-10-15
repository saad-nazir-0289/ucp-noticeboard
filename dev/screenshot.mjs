// Takes a screenshot of a page from the local preview (dev/start-local.sh).
//
//   node dev/screenshot.mjs <url> <out.png> [options]
//
//   --mobile          phone-sized viewport (390x844, touch) instead of desktop
//   --as <roll>       open the PWA already identified as this Roll Number
//                     (skips its first-run onboarding)
//   --full            capture the whole scrollable page
//   --selector <css>  capture just this element
//   --wait <ms>       extra settle time after load (default 500)
//
// Browser console errors and failed requests are printed, so a broken
// page shows up as more than just a bad-looking picture.
import { chromium } from "playwright";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.match(/^--(as|selector|wait)$/));
const [url, out] = positional;

if (!url || !out) {
  console.error("usage: node dev/screenshot.mjs <url> <out.png> [--mobile] [--as <roll>] [--full] [--selector <css>] [--wait <ms>]");
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext(
  flag("mobile")
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1366, height: 900 } }
);

const roll = option("as");
if (roll) {
  // Same keys as pwa/src/storage.ts.
  await context.addInitScript((rollNumber) => {
    if (!localStorage.getItem("ucpnb_rollNumber")) {
      localStorage.setItem("ucpnb_rollNumber", rollNumber);
      localStorage.setItem("ucpnb_name", "");
      localStorage.setItem("ucpnb_university", "");
      localStorage.setItem("ucpnb_department", "");
    }
  }, roll);
}

const page = await context.newPage();
page.on("console", (msg) => msg.type() === "error" && console.error(`[console] ${msg.text()}`));
page.on("pageerror", (err) => console.error(`[page error] ${err.message}`));
page.on("requestfailed", (req) => {
  const error = req.failure()?.errorText;
  // Chromium reports successful empty (204) fetch responses as
  // ERR_ABORTED; real failures (refused, CORS, DNS) have other codes.
  if (error !== "net::ERR_ABORTED") console.error(`[request failed] ${req.url()} ${error}`);
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(option("wait", 500)));

const selector = option("selector");
if (selector) {
  await page.locator(selector).screenshot({ path: out });
} else {
  await page.screenshot({ path: out, fullPage: flag("full") });
}

console.log(`saved ${out}`);
await browser.close();
