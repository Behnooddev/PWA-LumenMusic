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
import { Songs, Playlists } from "../database/db.js";
import { estimatePackageSize, formatBytes } from "../services/lmpService.js";

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
 * The full export wizard: package name/author, song & playlist
 * selection, optional-data toggles, and a live size estimate.
 * Resolves with the options object exportPackage() expects, or
 * `null` if the user cancels.
 */
export async function showExportWizard({ defaultName = "My Lumen Library" } = {}) {
  ensureModal();
  setLocked(true); // only Cancel/Export buttons should close this — see note below
  sheetEl.classList.add("wizard");
  clearNode(sheetEl);

  const [allSongs, allPlaylists] = await Promise.all([Songs.all(), Playlists.all()]);

  return new Promise((resolve) => {
    const state = {
      songIds: new Set(allSongs.map((s) => s.id)), // default: everything selected
      playlistIds: new Set(allPlaylists.map((p) => p.id)),
      includeCovers: true,
      includeLyrics: true,
      includeFavorites: true,
      includePlayCount: true,
      includePlayHistory: false,
      includeSettings: false,
      includeMoodTags: false,
    };

    const nameInput = el("input", { type: "text", value: defaultName, "aria-label": t("lmp.packageName") });
    const authorInput = el("input", { type: "text", placeholder: t("lmp.authorPlaceholder"), "aria-label": t("lmp.author") });

    const sizeLabel = el("div", { class: "lmp-size-estimate" }, t("lmp.calculating"));
    async function refreshEstimate() {
      const { bytes } = await estimatePackageSize({
        songIds: [...state.songIds],
        playlistIds: [...state.playlistIds],
        includeCovers: state.includeCovers,
        includeLyrics: state.includeLyrics,
      });
      sizeLabel.textContent = t("lmp.estimatedSize", { size: formatBytes(bytes) });
    }

    function toggleRow(labelText, checked, onChange) {
      const row = el("label", { class: "lmp-toggle-row" });
      const checkbox = el("input", { type: "checkbox" });
      checkbox.checked = checked;
      checkbox.addEventListener("change", () => onChange(checkbox.checked));
      row.append(checkbox, el("span", {}, labelText));
      return row;
    }

    // ---- song/playlist selection ----
    const selectionSection = el("div", { class: "lmp-section" });
    selectionSection.appendChild(el("div", { class: "lmp-section-title" }, t("lmp.whatToInclude")));

    if (allPlaylists.length) {
      const plList = el("div", { class: "lmp-checklist" });
      allPlaylists.forEach((pl) => {
        plList.appendChild(toggleRow(`${pl.name} (${pl.songIds.length})`, true, (checked) => {
          checked ? state.playlistIds.add(pl.id) : state.playlistIds.delete(pl.id);
          refreshEstimate();
        }));
      });
      selectionSection.appendChild(el("div", { class: "lmp-subheading" }, t("lmp.playlists")));
      selectionSection.appendChild(plList);
    }

    const songList = el("div", { class: "lmp-checklist lmp-checklist-scroll" });
    allSongs.forEach((song) => {
      songList.appendChild(toggleRow(`${song.title} — ${song.artist}`, true, (checked) => {
        checked ? state.songIds.add(song.id) : state.songIds.delete(song.id);
        refreshEstimate();
      }));
    });
    selectionSection.appendChild(el("div", { class: "lmp-subheading" }, t("lmp.songs")));
    selectionSection.appendChild(songList);

    // ---- optional data toggles ----
    const optionsSection = el("div", { class: "lmp-section" });
    optionsSection.appendChild(el("div", { class: "lmp-section-title" }, t("lmp.optionalData")));
    const optionsList = el("div", { class: "lmp-checklist" });
    [
      ["includeCovers", t("lmp.includeCovers")],
      ["includeLyrics", t("lmp.includeLyrics")],
      ["includeFavorites", t("lmp.includeFavorites")],
      ["includePlayCount", t("lmp.includePlayCount")],
      ["includePlayHistory", t("lmp.includePlayHistory")],
      ["includeSettings", t("lmp.includeSettings")],
      ["includeMoodTags", t("lmp.includeMoodTags")],
    ].forEach(([key, label]) => {
      optionsList.appendChild(toggleRow(label, state[key], (checked) => {
        state[key] = checked;
        if (key === "includeCovers" || key === "includeLyrics") refreshEstimate();
      }));
    });
    optionsSection.appendChild(optionsList);

    const cancelBtn = el("button", { class: "btn ghost" }, t("common.cancel"));
    const confirmBtn = el("button", { class: "btn primary" }, t("lmp.exportButton"));
    cancelBtn.addEventListener("click", () => { close(); sheetEl.classList.remove("wizard"); resolve(null); });
    confirmBtn.addEventListener("click", () => {
      if (!state.songIds.size) return; // nothing selected — silently ignore, button stays
      sheetEl.classList.remove("wizard");
      resolve({
        packageName: nameInput.value.trim() || defaultName,
        author: authorInput.value.trim(),
        description: "",
        songIds: [...state.songIds],
        playlistIds: [...state.playlistIds],
        includeCovers: state.includeCovers,
        includeLyrics: state.includeLyrics,
        includeFavorites: state.includeFavorites,
        includePlayCount: state.includePlayCount,
        includePlayHistory: state.includePlayHistory,
        includeSettings: state.includeSettings,
        includeMoodTags: state.includeMoodTags,
      });
    });

    sheetEl.append(
      el("h2", { class: "lmp-title" }, t("lmp.exportTitle")),
      el("div", { class: "lmp-field" }, [el("label", {}, t("lmp.packageName")), nameInput]),
      el("div", { class: "lmp-field" }, [el("label", {}, t("lmp.author")), authorInput]),
      selectionSection,
      optionsSection,
      sizeLabel,
      el("div", { class: "lmp-actions" }, [cancelBtn, confirmBtn])
    );

    refreshEstimate();
    open();
  });
}

export function showProgress(stageLabel, current = null, total = null, onCancel = null) {
  ensureModal();
  setLocked(true);
  sheetEl.classList.remove("wizard");
  clearNode(sheetEl);

  const counter = current !== null && total !== null
    ? el("div", { class: "lmp-counter" }, `${current} / ${total}`)
    : null;

  sheetEl.append(
    el("div", { class: "lmp-spinner", "aria-hidden": "true" }),
    el("h2", { class: "lmp-title" }, stageLabel),
    ...(counter ? [counter] : [])
  );

  if (onCancel) {
    const cancelBtn = el("button", { class: "btn ghost" }, t("common.cancel"));
    cancelBtn.addEventListener("click", onCancel);
    sheetEl.appendChild(el("div", { class: "lmp-actions" }, [cancelBtn]));
  }

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
  sheetEl.classList.remove("wizard");
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
  sheetEl.classList.remove("wizard");
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
