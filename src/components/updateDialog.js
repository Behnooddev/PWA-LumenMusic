/**
 * components/updateDialog.js
 * ---------------------------------------------------------------
 * "A new version is available" prompt. Deliberately reuses the same
 * .lmp-modal / .lmp-sheet CSS classes as components/lmpDialog.js so
 * it's visually consistent with zero new stylesheet rules — this is
 * a second instance of the same visual pattern, not a new one.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { t } from "../services/i18nService.js";
import { remindLater, applyUpdateAndReload } from "../services/updateService.js";

let modalEl = null;
let sheetEl = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = el("div", { class: "lmp-modal", "aria-hidden": "true", role: "dialog", "aria-modal": "true" });
  const backdrop = el("div", { class: "lmp-backdrop" });
  sheetEl = el("div", { class: "lmp-sheet glass" });
  backdrop.addEventListener("click", close);
  modalEl.append(backdrop, sheetEl);
  document.body.appendChild(modalEl);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl.classList.contains("open")) close();
  });
}

function open() {
  ensureModal();
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden", "false");
}

function close() {
  if (!modalEl) return;
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden", "true");
}

/** Shows the "update available" dialog for the given release/commit info. */
export function showUpdateAvailable(info) {
  ensureModal();
  clearNode(sheetEl);

  const remindBtn = el("button", { class: "btn ghost" }, t("update.remindLater"));
  const updateBtn = el("button", { class: "btn primary" }, t("update.updateNow"));

  remindBtn.addEventListener("click", async () => {
    await remindLater(info.identifier);
    close();
  });
  updateBtn.addEventListener("click", async () => {
    clearNode(sheetEl);
    sheetEl.append(
      el("div", { class: "lmp-spinner", "aria-hidden": "true" }),
      el("h2", { class: "lmp-title" }, t("update.applying"))
    );
    await applyUpdateAndReload();
  });

  const changelogLines = (info.changelog || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);

  sheetEl.append(
    el("div", { class: "lmp-icon", "aria-hidden": "true" }, "✨"),
    el("h2", { class: "lmp-title" }, t("update.title")),
    el("p", { class: "lmp-message" }, t("update.message", { name: info.name })),
    ...(changelogLines.length ? [buildChangelogList(changelogLines)] : []),
    el("div", { class: "lmp-actions" }, [remindBtn, updateBtn])
  );

  open();
}

function buildChangelogList(lines) {
  const list = el("ul", { class: "lmp-details" });
  lines.forEach((line) => list.appendChild(el("li", {}, line.replace(/^[-*]\s*/, ""))));
  return list;
}
