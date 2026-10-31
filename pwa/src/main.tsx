import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Goodbye } from "./Goodbye";
import "./fonts.css";
import "@shared/styles/tokens.css";
import "@shared/styles/components.css";
import "./styles.css";
import { keepPhoneLayout } from "./phoneLayout";
import { watchForInstall } from "./install";
import { startTheme } from "./theme";
import { keepUpToDate } from "./autoUpdate";

// Opening a link in a tab Chrome reuses, or reloading into a new version,
// would otherwise put back the old scroll position before the notices have
// loaded, leaving the feed part-way down. The app always opens at the top.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// Before the first render, so a phone in Chrome's desktop mode never shows the computer layout.
keepPhoneLayout();
startTheme();
// Listening from the start: the browser may say "installable" before the app renders.
watchForInstall();
// An app left open for days still gets new versions.
keepUpToDate();

// ?uninstalled=1 is where Chrome lands someone who just removed the
// extension (extension/background.js): just the one question, no sign-in.
const params = new URLSearchParams(window.location.search);
createRoot(document.getElementById("root")!).render(
  params.has("uninstalled") ? <Goodbye extensionVersion={params.get("v")} /> : <App />
);
