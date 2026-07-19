/**
 * The UCP portal doesn't expose the student's email anywhere the extension
 * can read, but the dashboard always shows the Roll Number (e.g.
 * "L1S23BSCS0285"). The most reliable place it appears is the account menu
 * in the top navigation bar, which — per DevTools inspection of the real
 * portal — looks like this:
 *
 *   <h2 class="heading_b">
 *     <span class="uk-text-truncate">Muhammad Raafay</span>
 *     <span class="sub-heading">L1S23BSCS0285</span>
 *     <span class="sub-heading">Faculty of Information Technology...</span>
 *   </h2>
 *
 * That's what PRIMARY_SELECTOR below targets. If the portal's markup ever
 * changes and this stops finding a match, a looser page-wide scan is used
 * as a fallback automatically — no code changes needed unless that also
 * fails, in which case re-inspect the page and update PRIMARY_SELECTOR.
 */

const PRIMARY_HEADING_SELECTOR = "h2.heading_b";

// Matches UCP-style roll numbers such as L1S23BSCS0285 (letter, digit,
// letter, 2 digits, program code, 4 digits). Kept slightly loose so small
// format variations across programs still match.
const ROLL_NUMBER_REGEX = /\b[A-Z]{1,2}\d[A-Z]\d{2}[A-Z]{2,8}\d{3,6}\b/;

export interface StudentIdentity {
  rollNumber: string;
  name: string;
}

function isPlausibleName(text: string): boolean {
  return /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(text) && !ROLL_NUMBER_REGEX.test(text);
}

function findFromAccountHeading(): StudentIdentity | null {
  const heading = document.querySelector(PRIMARY_HEADING_SELECTOR);
  if (!heading) return null;

  const nameEl = heading.querySelector(".uk-text-truncate");
  const subHeadings = Array.from(heading.querySelectorAll(".sub-heading"));

  const name = nameEl?.textContent?.trim();
  // The Roll Number is the first ".sub-heading" span; a second one (Faculty
  // name) may follow it, so we only ever look at index 0.
  const rollCandidate = subHeadings[0]?.textContent?.trim();

  if (name && rollCandidate && ROLL_NUMBER_REGEX.test(rollCandidate)) {
    return { rollNumber: rollCandidate, name };
  }
  return null;
}

function findNearbyName(rollNumberEl: Element): string | null {
  let container: Element | null = rollNumberEl;
  for (let level = 0; level < 4 && container; level++) {
    const candidates = container.querySelectorAll("h1, h2, h3, h4, h5, strong, b");
    for (const candidate of Array.from(candidates)) {
      const text = candidate.textContent?.trim() ?? "";
      if (isPlausibleName(text)) {
        return text;
      }
    }
    container = container.parentElement;
  }
  return null;
}

// Fallback: scan the whole page for anything roll-number-shaped, in case
// PRIMARY_HEADING_SELECTOR doesn't match (different page, portal update).
function findByPageScan(): StudentIdentity | null {
  const leafElements = Array.from(document.querySelectorAll("body *")).filter(
    (el) => el.children.length === 0
  );

  for (const el of leafElements) {
    const text = el.textContent?.trim() ?? "";
    const match = text.match(ROLL_NUMBER_REGEX);
    if (match) {
      const name = findNearbyName(el) ?? match[0];
      return { rollNumber: match[0], name };
    }
  }

  return null;
}

export function findStudentIdentity(): StudentIdentity | null {
  return findFromAccountHeading() ?? findByPageScan();
}
