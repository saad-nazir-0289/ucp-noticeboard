import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./fonts.css";
import "@shared/styles/tokens.css";
import "@shared/styles/components.css";
import "./styles.css";
import { keepPhoneLayout } from "./phoneLayout";
import { watchForInstall } from "./install";
import { startTheme } from "./theme";
import { keepUpToDate } from "./autoUpdate";

// Before the first render, so a phone in Chrome's desktop mode never shows the computer layout.
keepPhoneLayout();
startTheme();
// Listening from the start: the browser may say "installable" before the app renders.
watchForInstall();
// An app left open for days still gets new versions.
keepUpToDate();

createRoot(document.getElementById("root")!).render(<App />);
