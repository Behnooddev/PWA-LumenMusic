/**
 * pages/settings.js
 */

import { el, clearNode } from "../utils/dom.js";
import { t, setLanguage, getLang } from "../services/i18nService.js";
import { setTheme, getThemePreference } from "../services/themeService.js";
import { startSleepTimer, cancelSleepTimer, isSleepTimerActive, onTick } from "../services/sleepTimerService.js";
import { audioEl } from "../services/audioEngine.js";
import { exportLibrary, importLibrary } from "../services/transferService.js";
import { exportPackage, importPackage, LmpValidationError, ExportCancelledError } from "../services/lmpService.js";
import * as lmpDialog from "../components/lmpDialog.js";
import { wipeDatabase } from "../database/db.js";

const SLEEP_OPTIONS = [15, 30, 45, 60];

// Settings re-renders every time the page is opened or the language
// changes. Without tracking this, each render would call onTick() again
// and stack up listeners pointing at detached DOM nodes. Track the
// unsubscribe function so only the current render's listener is live.
let unsubscribeSleepTick = null;

export async function renderSettings(container, { onLanguageChanged, onDataReset }) {
  clearNode(container);

  container.appendChild(el("div", { class: "page-head" }, [
    el("h1", {}, t("settings.title")),
    el("p", { class: "sub" }, t("settings.subtitle")),
  ]));

  container.appendChild(buildThemePanel());
  container.appendChild(buildLanguagePanel(onLanguageChanged));
  container.appendChild(buildSleepTimerPanel());
  container.appendChild(buildLmpPanel());
  container.appendChild(buildDataPanel(onDataReset));
}

function buildThemePanel() {
  const panel = el("div", { class: "panel glass" });
  const current = getThemePreference();
  const seg = el("div", { class: "segmented", id: "themeToggle" }, [
    segButton("dark", t("settings.themeDark"), current),
    segButton("light", t("settings.themeLight"), current),
    segButton("system", t("settings.themeSystem"), current),
  ]);
  seg.addEventListener("click", async (e) => {
    const btn = e.target.closest(".seg");
    if (!btn) return;
    await setTheme(btn.dataset.value);
    Array.from(seg.children).forEach((b) => b.classList.toggle("active", b === btn));
  });

  panel.appendChild(el("div", { class: "panel-row" }, [
    el("div", {}, [
      el("div", { class: "panel-title" }, t("settings.theme")),
      el("div", { class: "panel-hint" }, t("settings.themeHint")),
    ]),
    seg,
  ]));
  return panel;
}

function buildLanguagePanel(onLanguageChanged) {
  const panel = el("div", { class: "panel glass" });
  const current = getLang();
  const seg = el("div", { class: "segmented" }, [
    segButton("en", "English", current),
    segButton("fa", "فارسی", current, "fa"),
  ]);
  seg.addEventListener("click", async (e) => {
    const btn = e.target.closest(".seg");
    if (!btn) return;
    await setLanguage(btn.dataset.value);
    onLanguageChanged?.();
  });

  panel.appendChild(el("div", { class: "panel-row" }, [
    el("div", {}, [
      el("div", { class: "panel-title" }, t("settings.language")),
      el("div", { class: "panel-hint" }, t("settings.languageHint")),
    ]),
    seg,
  ]));
  return panel;
}

function segButton(value, label, current) {
  const btn = el("button", { class: `seg${current === value ? " active" : ""}`, dataset: { value } }, label);
  return btn;
}

function buildSleepTimerPanel() {
  const panel = el("div", { class: "panel glass" });
  const status = el("div", { class: "panel-hint sleep-status" }, isSleepTimerActive() ? "" : t("settings.sleepTimerHint"));

  const seg = el("div", { class: "segmented" });
  const offBtn = el("button", { class: `seg${!isSleepTimerActive() ? " active" : ""}` }, t("settings.sleepTimerOff"));
  offBtn.addEventListener("click", () => {
    cancelSleepTimer();
    Array.from(seg.children).forEach((b) => b.classList.remove("active"));
    offBtn.classList.add("active");
  });
  seg.appendChild(offBtn);

  SLEEP_OPTIONS.forEach((minutes) => {
    const btn = el("button", { class: "seg" }, String(minutes));
    btn.addEventListener("click", () => {
      startSleepTimer(minutes, () => audioEl.pause());
      Array.from(seg.children).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    seg.appendChild(btn);
  });

  unsubscribeSleepTick?.();
  unsubscribeSleepTick = onTick((remainingMs) => {
    if (remainingMs > 0) {
      const mins = Math.ceil(remainingMs / 60000);
      status.textContent = t("settings.sleepTimerActive", { minutes: mins });
    } else {
      status.textContent = t("settings.sleepTimerHint");
    }
  });

  panel.appendChild(el("div", { class: "panel-row" }, [
    el("div", {}, [
      el("div", { class: "panel-title" }, t("settings.sleepTimer")),
      status,
    ]),
  ]));
  panel.appendChild(seg);
  return panel;
}

function buildLmpPanel() {
  const panel = el("div", { class: "panel glass" });
  panel.appendChild(el("div", { class: "panel-title" }, t("lmp.sectionTitle")));
  panel.appendChild(el("div", { class: "panel-hint" }, t("lmp.sectionHint")));

  const exportBtn = el("button", { class: "btn primary data-btn" }, t("lmp.exportAction"));
  exportBtn.addEventListener("click", async () => {
    const options = await lmpDialog.showExportWizard({
      defaultName: `My Lumen Library — ${new Date().toISOString().slice(0, 10)}`,
    });
    if (!options) return;

    const cancelToken = { cancelled: false };
    lmpDialog.showProgress(t("lmp.stageBuilding"), null, null, () => { cancelToken.cancelled = true; });
    try {
      const result = await exportPackage({ ...options, cancelToken }, (current, total) => {
        lmpDialog.updateProgress(t("lmp.stageBuilding"), current, total);
      });
      lmpDialog.showSuccess({
        title: t("lmp.exportSuccessTitle"),
        message: t("lmp.exportSuccessMessage", { songs: result.songCount, playlists: result.playlistCount }),
      });
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        lmpDialog.closeDialog();
        return;
      }
      lmpDialog.showError({
        title: err instanceof LmpValidationError ? t("lmp.invalidTitle") : t("lmp.genericErrorTitle"),
        message: err.message,
        details: err instanceof LmpValidationError ? err.details : [],
      });
    }
  });

  const importInput = el("input", { type: "file", accept: ".lmp,application/zip", hidden: true });
  const importBtn = el("button", { class: "btn ghost data-btn" }, t("lmp.importAction"));
  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    importInput.value = "";
    if (!file) return;

    lmpDialog.showProgress(t("lmp.stageReading"));
    try {
      const result = await importPackage(file, (stage, current, total) => {
        const label = stage === "validating" ? t("lmp.stageValidating")
          : stage === "importing" ? t("lmp.stageImporting")
          : t("lmp.stageReading");
        lmpDialog.updateProgress(label, current, total);
      });
      lmpDialog.showSuccess({
        title: t("lmp.importSuccessTitle"),
        message: t("lmp.importSuccessMessage", { songs: result.songCount, playlists: result.playlistCount }),
        details: result.warnings,
      });
    } catch (err) {
      lmpDialog.showError({
        title: err instanceof LmpValidationError ? t("lmp.invalidTitle") : t("lmp.genericErrorTitle"),
        message: err.message,
        details: err instanceof LmpValidationError ? err.details : [],
      });
    }
  });

  panel.appendChild(el("div", { class: "data-actions" }, [exportBtn, importBtn, importInput]));
  return panel;
}

function buildDataPanel(onDataReset) {
  const panel = el("div", { class: "panel glass" });
  panel.appendChild(el("div", { class: "panel-title" }, t("settings.dataTitle")));
  panel.appendChild(el("div", { class: "panel-hint" }, t("settings.dataHint")));

  const exportBtn = el("button", { class: "btn primary data-btn" }, t("settings.exportLibrary"));
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    try { await exportLibrary(); } finally { exportBtn.disabled = false; }
  });

  const importInput = el("input", { type: "file", accept: "application/json", hidden: true });
  const importBtn = el("button", { class: "btn ghost data-btn" }, t("settings.importLibrary"));
  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    await importLibrary(file);
    location.reload();
  });

  const resetBtn = el("button", { class: "btn danger data-btn" }, t("settings.resetButton"));
  resetBtn.addEventListener("click", async () => {
    if (!confirm(t("settings.resetConfirm"))) return;
    await wipeDatabase();
    onDataReset ? onDataReset() : location.reload();
  });

  panel.append(
    el("div", { class: "data-actions" }, [exportBtn, importBtn, importInput]),
    el("div", { class: "panel-row danger-row" }, [
      el("div", {}, [
        el("div", { class: "panel-title" }, t("settings.resetLibrary")),
        el("div", { class: "panel-hint" }, t("settings.resetHint")),
      ]),
      resetBtn,
    ])
  );
  return panel;
}
