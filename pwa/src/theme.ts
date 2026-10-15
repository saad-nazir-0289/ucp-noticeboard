// Light or dark: follows the device unless the person picks one in the
// account menu. The choice is applied as <html data-theme="light|dark">,
// which styles.css keys the dark colours on. index.html applies the saved
// choice before the first paint (same key and rules), so there's no flash.
export type ThemePreference = "system" | "light" | "dark";

const KEY = "ucpnb_theme";
const BAR_COLOURS = { light: "#ffffff", dark: "#0b111c" } as const;

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage blocked: just follow the device.
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference, deviceIsDark: boolean): "light" | "dark" {
  if (preference === "system") return deviceIsDark ? "dark" : "light";
  return preference;
}

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

function apply(preference: ThemePreference): void {
  const theme = resolveTheme(preference, darkQuery()?.matches ?? false);
  document.documentElement.dataset.theme = theme;
  // The phone's status bar matches the app, not the device setting.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = BAR_COLOURS[theme];
  });
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // Not remembered, but still applied for this visit.
  }
  apply(preference);
}

// Applies the saved choice and keeps "Auto" in step with the device.
export function startTheme(): void {
  apply(getThemePreference());
  darkQuery()?.addEventListener?.("change", () => {
    if (getThemePreference() === "system") apply("system");
  });
}
