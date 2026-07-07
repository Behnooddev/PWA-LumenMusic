/**
 * services/themeService.js
 * ---------------------------------------------------------------
 * Supports "dark", "light", and "system" (follows the OS/browser
 * prefers-color-scheme and updates live if it changes).
 * ---------------------------------------------------------------
 */

import { Settings } from "../database/db.js";

let currentPreference = "dark"; // what the user picked: dark | light | system
const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

function resolveEffectiveTheme(preference) {
  if (preference === "system") return mediaQuery.matches ? "light" : "dark";
  return preference;
}

function applyTheme(preference) {
  const effective = resolveEffectiveTheme(preference);
  document.documentElement.dataset.theme = effective;
}

export function getThemePreference() {
  return currentPreference;
}

export async function setTheme(preference) {
  currentPreference = preference;
  applyTheme(preference);
  await Settings.set("theme", preference);
}

export async function initTheme() {
  currentPreference = await Settings.get("theme", "dark");
  applyTheme(currentPreference);
  mediaQuery.addEventListener("change", () => {
    if (currentPreference === "system") applyTheme("system");
  });
}
