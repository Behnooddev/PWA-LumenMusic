/**
 * utils/semver.js
 * ---------------------------------------------------------------
 * Minimal semantic version comparison. Compares version strings
 * segment-by-segment as numbers, so "1.0.9" < "1.0.10" and
 * "1.2.0" < "1.10.0" — a plain string comparison would get both of
 * those backwards.
 * ---------------------------------------------------------------
 */

/** Parses "1.2.3" (or "1.2", or "1") into [1, 2, 3]. Non-numeric/missing segments become 0. */
function parseVersion(version) {
  return String(version || "0")
    .split(".")
    .map((part) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/**
 * Returns -1 if a < b, 0 if equal, 1 if a > b — the standard
 * comparator shape, usable directly with Array.prototype.sort.
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}
