import { createRoot } from "react-dom/client";
import { NoticeBoard } from "./NoticeBoard";
import "./content.css";

const CONTAINER_ID = "ucp-noticeboard-root";

/**
 * The UCP portal has no stable data-attributes to hook into, so we locate
 * an existing section by its heading text and inject relative to it.
 * If the portal markup changes, update SECTION_HEADING_TEXT below —
 * everything else keeps working as-is.
 */
const SECTION_HEADING_TEXT = "Classes, Grades and Attendance";

function findInjectionAnchor(): Element | null {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5"));
  const heading = headings.find((el) =>
    el.textContent?.trim().toLowerCase().includes(SECTION_HEADING_TEXT.toLowerCase())
  );
  if (!heading) return null;

  // The portal is built with UIkit, whose grid columns/cards use classes
  // like "uk-width-large-3-10". That's a much tighter, more reliable
  // container to anchor on than a generic `closest("div")`, which risked
  // matching a huge page-wide wrapper and pushing the board to the very
  // top of the page instead of right above this specific section.
  const gridWrapper = heading.closest('[class*="uk-width"]');
  if (gridWrapper) return gridWrapper;

  // Fallback: the heading's immediate parent, never an unbounded ancestor walk.
  return heading.parentElement ?? heading;
}

function inject() {
  if (document.getElementById(CONTAINER_ID)) return; // avoid double-injection

  const anchor = findInjectionAnchor();
  const container = document.createElement("div");
  container.id = CONTAINER_ID;

  if (anchor?.parentElement) {
    // Insert BEFORE the "Classes, Grades and Attendance" section, so the
    // NoticeBoard sits above it (right under the Academics/profile card).
    anchor.parentElement.insertBefore(container, anchor);
  } else {
    // Fallback: append to the end of the page body so the board still shows.
    document.body.appendChild(container);
  }

  createRoot(container).render(<NoticeBoard />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inject);
} else {
  inject();
}
