/**
 * components/importPanel.js
 * ---------------------------------------------------------------
 * Handles both explicit "Import songs" clicks (native file picker)
 * and dropping audio files anywhere on the window. Shows a small
 * toast while metadata is being read and when it's done.
 * ---------------------------------------------------------------
 */

import { $, el } from "../utils/dom.js";
import { importFiles } from "../services/importService.js";
import { t } from "../services/i18nService.js";

export function initImportPanel({ onImported }) {
  const fileInput = $("#globalFileInput");
  const toast = el("div", { class: "toast", role: "status", "aria-live": "polite" });
  document.body.appendChild(toast);

  function showToast(text, sticky = false) {
    toast.textContent = text;
    toast.classList.add("visible");
    if (!sticky) {
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => toast.classList.remove("visible"), 2600);
    }
  }

  async function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    showToast(t("import.processing"), true);
    const imported = await importFiles(fileList, (i, total, name) => {
      showToast(`${t("import.processing")} (${i}/${total})`, true);
    });
    toast.classList.remove("visible");
    if (imported.length === 1) showToast(t("import.addedOne", { title: imported[0].title }));
    else if (imported.length > 1) showToast(t("import.addedMany", { count: imported.length }));
    onImported?.(imported);
  }

  function openPicker() {
    fileInput.value = "";
    fileInput.click();
  }

  fileInput.addEventListener("change", () => handleFiles(fileInput.files));

  // whole-window drag & drop
  let dragDepth = 0;
  const overlay = el("div", { class: "drop-overlay", "aria-hidden": "true" }, t("import.dragHint"));
  document.body.appendChild(overlay);

  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    dragDepth++;
    overlay.classList.add("visible");
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.classList.remove("visible");
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove("visible");
    handleFiles(e.dataTransfer.files);
  });

  return { openPicker };
}
