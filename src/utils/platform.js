/**
 * utils/platform.js
 * ---------------------------------------------------------------
 * Small, honest feature/platform detection. iOS specifically has no
 * reliable feature-test for "is this Safari on iOS", so this uses
 * user-agent sniffing for iOS/Safari detection (unavoidable — there
 * is no capability to feature-detect here) and real feature
 * detection (`in` checks) for everything else.
 * ---------------------------------------------------------------
 */

export function isIOS() {
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as "Macintosh" but exposes touch points — the
  // standard workaround to still detect it as iOS.
  const isIPadOS = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || isIPadOS;
}

export function isSafari() {
  const ua = navigator.userAgent || "";
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
}

export function isAndroid() {
  return /Android/.test(navigator.userAgent || "");
}

export function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}

export function isStandalonePwa() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
