/**
 * utils/format.js — time & number formatting, including Persian digits.
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function fmtTime(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Converts any ASCII digits found in a string to Persian digits. */
export function toPersianDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Locale-aware time/number formatting used across the UI. */
export function localizeTime(totalSeconds, lang) {
  const str = fmtTime(totalSeconds);
  return lang === "fa" ? toPersianDigits(str) : str;
}

export function localizeNumber(value, lang) {
  return lang === "fa" ? toPersianDigits(value) : String(value);
}

export function humanDate(timestamp, lang) {
  const d = new Date(timestamp);
  const str = d.toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", {
    month: "short", day: "numeric",
  });
  return str;
}
