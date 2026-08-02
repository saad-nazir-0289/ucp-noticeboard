import { createRoot } from "react-dom/client";
import { NoticeBoard } from "./NoticeBoard";
import "./content.css";

const CONTAINER_ID = "ucp-noticeboard-root";
const SECTION_HEADING_TEXT = "Classes, Grades and Attendance";

function findInjectionAnchor(): Element | null {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5"));
  const heading = headings.find((el) =>
    el.textContent?.trim().toLowerCase().includes(SECTION_HEADING_TEXT.toLowerCase())
  );
  if (!heading) return null;

  const gridWrapper = heading.closest('[class*="uk-width"]');
  if (gridWrapper) return gridWrapper;

  return heading.parentElement ?? heading;
}

function inject() {
  if (document.getElementById(CONTAINER_ID)) return;

  const anchor = findInjectionAnchor();
  const container = document.createElement("div");
  container.id = CONTAINER_ID;

  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(container, anchor);
  } else {
    document.body.appendChild(container);
  }

  createRoot(container).render(<NoticeBoard />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inject);
} else {
  inject();
}
