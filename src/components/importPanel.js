/**
 * components/importPanel.js
 * ---------------------------------------------------------------
 * Handles both explicit "Import songs" clicks (native file picker)
 * and dropping audio files anywhere on the window. Shows a small
 * toast while metadata is being read and when it's done.
 * ---------------------------------------------------------------
 */

import { $, el } from "../utils/dom.js";
import { importFiles, isAudioFile } from "../services/importService.js";
import { t } from "../services/i18nService.js";
import { isIOS } from "../utils/platform.js";

export function initImportPanel({ onImported }) {
  const fileInput = $("#globalFileInput");
  const toast = el("div", { class: "toast", role: "status", "aria-live": "polite" });
  document.body.appendChild(toast);

  function showToast(text, sticky = false, tone = "default") {
    toast.textContent = text;
    toast.classList.add("visible");
    toast.classList.toggle("toast-error", tone === "error");
    if (!sticky) {
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => {
        toast.classList.remove("visible", "toast-error");
      }, tone === "error" ? 5000 : 2600);
    }
  }

  async function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;

    const allFiles = Array.from(fileList);
    const audioFiles = allFiles.filter(isAudioFile);

    if (!audioFiles.length) {
      // Every selected item was filtered out. On iOS this is almost
      // always an iCloud file that hasn't finished downloading (it
      // shows a cloud icon rather than the actual audio), or a format
      // Safari reports with an unrecognized MIME type. Say so plainly
      // instead of doing nothing.
      showToast(isIOS() ? t("import.noneImportableIOS") : t("import.noneImportable"), false, "error");
      return;
    }

    showToast(t("import.processing"), true);
    const imported = await importFiles(audioFiles, (i, total) => {
      showToast(`${t("import.processing")} (${i}/${total})`, true);
    });
    toast.classList.remove("visible");

    if (!imported.length) {
      showToast(t("import.allFailed"), false, "error");
      return;
    }
    if (imported.length < audioFiles.length) {
      showToast(t("import.partialAdded", { added: imported.length, total: audioFiles.length }), false, "error");
    } else if (imported.length === 1) {
      showToast(t("import.addedOne", { title: imported[0].title }));
    } else {
      showToast(t("import.addedMany", { count: imported.length }));
    }
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
