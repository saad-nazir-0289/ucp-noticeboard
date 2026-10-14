import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./fonts.css";
import "@shared/styles/tokens.css";
import "@shared/styles/components.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
