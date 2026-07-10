/**
 * components/updateDialog.js
 * ---------------------------------------------------------------
 * "A new version is available" prompt, driven by version.json.
 * Reuses the same .lmp-modal / .lmp-sheet CSS classes as
 * components/lmpDialog.js for visual consistency — no new stylesheet
 * rules for the dialog shell itself.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { t } from "../services/i18nService.js";
import { dismissVersion, applyUpdateAndReload } from "../services/updateService.js";

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

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr || "";
  }
}

/** Shows the "update available" dialog for `{ current, latest }` version.json payloads. */
export function showUpdateAvailable({ current, latest }) {
  ensureModal();
  clearNode(sheetEl);

  const remindBtn = el("button", { class: "btn ghost" }, t("update.remindLater"));
  const updateBtn = el("button", { class: "btn primary" }, t("update.updateNow"));

  remindBtn.addEventListener("click", async () => {
    await dismissVersion(latest.version);
    close();
  });

  updateBtn.addEventListener("click", async () => {
    const stageLabel = el("h2", { class: "lmp-title" }, t("update.stageChecking"));
    clearNode(sheetEl);
    sheetEl.append(el("div", { class: "lmp-spinner", "aria-hidden": "true" }), stageLabel);

    await applyUpdateAndReload((stage) => {
      const map = {
        checking: t("update.stageChecking"),
        installing: t("update.stageInstalling"),
        activating: t("update.stageActivating"),
        timeout: t("update.stageTimeout"),
      };
      stageLabel.textContent = map[stage] || map.checking;
      if (stage === "timeout") {
        // Never leave the UI silently stuck — offer a manual retry.
        const retryBtn = el("button", { class: "btn primary" }, t("common.close"));
        retryBtn.addEventListener("click", close);
        sheetEl.appendChild(el("div", { class: "lmp-actions" }, [retryBtn]));
      }
    });
  });

  const versionRows = el("div", { class: "update-version-rows" }, [
    versionRow(t("update.currentVersion"), current.version),
    versionRow(t("update.latestVersion"), latest.version),
    versionRow(t("update.releaseDate"), formatDate(latest.releaseDate)),
  ]);

  const changelog = Array.isArray(latest.changelog) ? latest.changelog.filter(Boolean).slice(0, 12) : [];

  sheetEl.append(
    el("div", { class: "lmp-icon", "aria-hidden": "true" }, "✨"),
    el("h2", { class: "lmp-title" }, t("update.title")),
    versionRows,
    ...(changelog.length ? [buildChangelogList(changelog)] : []),
    el("div", { class: "lmp-actions" }, [remindBtn, updateBtn])
  );

  open();
}

function versionRow(label, value) {
  return el("div", { class: "update-version-row" }, [
    el("span", { class: "update-version-label" }, label),
    el("span", { class: "update-version-value" }, value),
  ]);
}

function buildChangelogList(lines) {
  const list = el("ul", { class: "lmp-details" });
  lines.forEach((line) => list.appendChild(el("li", {}, line)));
  return list;
}
