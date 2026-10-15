import type { Category } from "./types";

/**
 * The fixed categories, in display order — mirrors the backend's
 * CategoryCatalog (the source of truth; the apps load them from the API).
 * Kept here for tests and for anything that needs the list before login.
 */
export const CATEGORY_NAMES = [
  "Academics",
  "Campus",
  "Careers",
  "Scholarships",
  "Workshops",
  "Competitions",
  "Events",
  "Societies",
  "Sports",
] as const;

/** The catalog with stand-in ids, for tests. */
export const CATALOG_FOR_TESTS: Category[] = CATEGORY_NAMES.map((name, i) => ({ id: i + 1, name }));
