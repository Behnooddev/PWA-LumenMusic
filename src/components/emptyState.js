/**
 * components/emptyState.js
 * ---------------------------------------------------------------
 * The very first thing a new user sees: no bundled songs, just an
 * invitation to import their own. Reused wherever a list is empty.
 * ---------------------------------------------------------------
 */

import { el } from "../utils/dom.js";
import { t } from "../services/i18nService.js";

export function createEmptyState({ title, body, actionLabel, onAction, icon = "🎵" } = {}) {
  const wrap = el("div", { class: "empty-state-panel" }, [
    el("div", { class: "empty-state-icon", "aria-hidden": "true" }, icon),
    el("h2", { class: "empty-state-title" }, title ?? t("home.emptyTitle")),
    el("p", { class: "empty-state-body" }, body ?? t("home.emptyBody")),
  ]);

  if (onAction) {
    const btn = el("button", { class: "btn primary large" }, actionLabel ?? t("home.importFirst"));
    btn.addEventListener("click", onAction);
    wrap.appendChild(btn);
  }

  return wrap;
}
