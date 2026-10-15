import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./fonts.css";
import "@shared/styles/tokens.css";
import "@shared/styles/components.css";
import "./styles.css";
import { keepPhoneLayout } from "./phoneLayout";
import { watchForInstall } from "./install";
import { startTheme } from "./theme";

// Before the first render, so a phone in Chrome's desktop mode never shows the computer layout.
keepPhoneLayout();
startTheme();
// Listening from the start: the browser may say "installable" before the app renders.
watchForInstall();

createRoot(document.getElementById("root")!).render(<App />);
