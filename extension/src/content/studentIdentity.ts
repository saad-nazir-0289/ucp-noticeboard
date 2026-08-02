const PRIMARY_HEADING_SELECTOR = "h2.heading_b";

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
