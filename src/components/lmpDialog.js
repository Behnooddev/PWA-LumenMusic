/**
 * components/lmpDialog.js
 * ---------------------------------------------------------------
 * A single reusable modal for the whole .lmp import/export flow:
 * an export-options form, a progress state (loading/validating/
 * importing), and success/error result states. Visually it's the
 * same glass-panel + yellow-gradient language as the lyrics modal
 * and settings panels — no new design system introduced.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { t } from "../services/i18nService.js";

let modalEl = null;
let sheetEl = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = el("div", { class: "lmp-modal", "aria-hidden": "true", role: "dialog", "aria-modal": "true" });
  const backdrop = el("div", { class: "lmp-backdrop" });
  sheetEl = el("div", { class: "lmp-sheet glass" });
  backdrop.addEventListener("click", () => {
    if (!sheetEl.dataset.locked) close();
  });
  modalEl.append(backdrop, sheetEl);
  document.body.appendChild(modalEl);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl.classList.contains("open") && !sheetEl.dataset.locked) close();
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

function setLocked(locked) {
  if (sheetEl) sheetEl.dataset.locked = locked ? "1" : "";
}

/**
 * Shows the export-options form (package name + author) and resolves
 * with { packageName, author, description } when the user confirms,
 * or resolves with null if they cancel.
 */
export function showExportForm({ defaultName = "My Lumen Library" } = {}) {
  return new Promise((resolve) => {
    ensureModal();
    setLocked(false);
    clearNode(sheetEl);

    const nameInput = el("input", { type: "text", value: defaultName, "aria-label": t("lmp.packageName") });
    const authorInput = el("input", { type: "text", placeholder: t("lmp.authorPlaceholder"), "aria-label": t("lmp.author") });

    const cancelBtn = el("button", { class: "btn ghost" }, t("common.cancel"));
    const confirmBtn = el("button", { class: "btn primary" }, t("lmp.exportButton"));

    cancelBtn.addEventListener("click", () => { close(); resolve(null); });
    confirmBtn.addEventListener("click", () => {
      resolve({
        packageName: nameInput.value.trim() || defaultName,
        author: authorInput.value.trim(),
        description: "",
      });
    });

    sheetEl.append(
      el("div", { class: "lmp-icon", "aria-hidden": "true" }, "📦"),
      el("h2", { class: "lmp-title" }, t("lmp.exportTitle")),
      el("p", { class: "lmp-message" }, t("lmp.exportHint")),
      el("div", { class: "lmp-field" }, [
        el("label", {}, t("lmp.packageName")),
        nameInput,
      ]),
      el("div", { class: "lmp-field" }, [
        el("label", {}, t("lmp.author")),
        authorInput,
      ]),
      el("div", { class: "lmp-actions" }, [cancelBtn, confirmBtn])
    );

    open();
  });
}

export function showProgress(stageLabel, current = null, total = null) {
  ensureModal();
  setLocked(true);
  clearNode(sheetEl);

  const counter = current !== null && total !== null
    ? el("div", { class: "lmp-counter" }, `${current} / ${total}`)
    : null;

  sheetEl.append(
    el("div", { class: "lmp-spinner", "aria-hidden": "true" }),
    el("h2", { class: "lmp-title" }, stageLabel),
    ...(counter ? [counter] : [])
  );
  open();
}

export function updateProgress(stageLabel, current = null, total = null) {
  if (!sheetEl || !modalEl?.classList.contains("open")) return showProgress(stageLabel, current, total);
  const titleEl = sheetEl.querySelector(".lmp-title");
  const counterEl = sheetEl.querySelector(".lmp-counter");
  if (titleEl) titleEl.textContent = stageLabel;
  if (current !== null && total !== null) {
    if (counterEl) counterEl.textContent = `${current} / ${total}`;
    else sheetEl.appendChild(el("div", { class: "lmp-counter" }, `${current} / ${total}`));
  }
}

export function showSuccess({ title, message, details = [] }) {
  ensureModal();
  setLocked(false);
  clearNode(sheetEl);

  const closeBtn = el("button", { class: "btn primary" }, t("common.close"));
  closeBtn.addEventListener("click", close);

  sheetEl.append(
    el("div", { class: "lmp-icon success", "aria-hidden": "true" }, "✓"),
    el("h2", { class: "lmp-title" }, title),
    el("p", { class: "lmp-message" }, message),
    ...(details.length ? [buildDetailsList(details, "warn")] : []),
    el("div", { class: "lmp-actions" }, [closeBtn])
  );
  open();
}

export function showError({ title, message, details = [] }) {
  ensureModal();
  setLocked(false);
  clearNode(sheetEl);

  const closeBtn = el("button", { class: "btn ghost" }, t("common.close"));
  closeBtn.addEventListener("click", close);

  sheetEl.append(
    el("div", { class: "lmp-icon error", "aria-hidden": "true" }, "✕"),
    el("h2", { class: "lmp-title" }, title),
    el("p", { class: "lmp-message" }, message),
    ...(details.length ? [buildDetailsList(details, "error")] : []),
    el("div", { class: "lmp-actions" }, [closeBtn])
  );
  open();
}

function buildDetailsList(details, tone) {
  const list = el("ul", { class: `lmp-details lmp-details-${tone}` });
  details.slice(0, 12).forEach((d) => list.appendChild(el("li", {}, d)));
  if (details.length > 12) list.appendChild(el("li", {}, t("lmp.moreItems", { count: details.length - 12 })));
  return list;
}

export function closeDialog() {
  close();
}
