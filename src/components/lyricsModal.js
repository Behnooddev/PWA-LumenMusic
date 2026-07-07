/**
 * components/lyricsModal.js
 * ---------------------------------------------------------------
 * Since Lumen ships with no bundled lyrics, this lets the user
 * paste their own per-song lyrics (plain text, or lines prefixed
 * with [mm:ss] for sync highlighting during playback).
 * ---------------------------------------------------------------
 */

import { $, $$, el, escapeHtml, clearNode } from "../utils/dom.js";
import { Lyrics } from "../database/db.js";
import { t, getLang } from "../services/i18nService.js";
import { audioEl, on } from "../services/audioEngine.js";

const TIME_TAG = /^\[(\d+):(\d{2})\]\s*(.*)$/;

function parseLyricsText(text) {
  return text.split("\n").map((line) => {
    const match = line.match(TIME_TAG);
    if (match) {
      const time = Number(match[1]) * 60 + Number(match[2]);
      return { time, text: match[3] };
    }
    return { time: null, text: line };
  }).filter((l) => l.text.trim().length || l.time !== null);
}

export function initLyricsModal() {
  const modal = $("#lyricsModal");
  const backdrop = $("#lyricsBackdrop");
  const closeBtn = $("#lyricsClose");
  const body = $("#lyricsBody");
  const titleEl = $("#lyricsTitle");
  const artistEl = $("#lyricsArtist");
  const coverEl = $("#lyricsCover");
  const langTabs = $$(".lyrics-lang-toggle .seg");

  let activeSong = null;
  let lyricsLang = getLang() === "fa" ? "fa" : "en";
  let currentParsed = [];
  let editing = false;

  function open(song) {
    if (!song) return;
    activeSong = song;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    titleEl.textContent = song.title;
    if (artistEl) artistEl.textContent = song.artist;
    coverEl.src = song.cover || "src/assets/icons/icon-192.png";
    editing = false;
    renderView();
    closeBtn.focus();
  }

  function close() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  async function renderView() {
    if (!activeSong) return;
    const record = await Lyrics.get(activeSong.id);
    const raw = record ? record[lyricsLang] : "";

    clearNode(body);

    if (!raw || !raw.trim()) {
      body.appendChild(el("p", { class: "empty-state" }, t("lyrics.noLyrics")));
      const addBtn = el("button", { class: "btn primary" }, t("lyrics.addLyrics"));
      addBtn.addEventListener("click", () => renderEditor(""));
      body.appendChild(addBtn);
      currentParsed = [];
      return;
    }

    currentParsed = parseLyricsText(raw);
    currentParsed.forEach((line) => {
      body.appendChild(el("div", {
        class: "lyric-line",
        dataset: { time: line.time ?? "" },
      }, line.text || "\u00A0"));
    });

    const editLink = el("button", { class: "btn ghost lyrics-edit-link" }, t("lyrics.editLyrics"));
    editLink.addEventListener("click", () => renderEditor(raw));
    body.appendChild(editLink);
  }

  function renderEditor(existingText) {
    editing = true;
    clearNode(body);
    const textarea = el("textarea", {
      class: "lyrics-textarea",
      "data-i18n-placeholder": "lyrics.placeholder",
      placeholder: t("lyrics.placeholder"),
      dir: lyricsLang === "fa" ? "rtl" : "ltr",
    });
    textarea.value = existingText || "";

    const actions = el("div", { class: "lyrics-editor-actions" });
    const saveBtn = el("button", { class: "btn primary" }, t("lyrics.save"));
    const cancelBtn = el("button", { class: "btn ghost" }, t("lyrics.cancel"));

    saveBtn.addEventListener("click", async () => {
      const record = (await Lyrics.get(activeSong.id)) || { songId: activeSong.id, en: "", fa: "" };
      record[lyricsLang] = textarea.value;
      await Lyrics.save(activeSong.id, record);
      editing = false;
      renderView();
    });
    cancelBtn.addEventListener("click", () => { editing = false; renderView(); });

    actions.append(saveBtn, cancelBtn);
    body.append(textarea, actions);
    textarea.focus();
  }

  langTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      langTabs.forEach((b) => b.classList.remove("active"));
      tab.classList.add("active");
      lyricsLang = tab.dataset.lang;
      if (!editing) renderView();
    });
  });

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  on("timeupdate", (currentTime) => {
    if (!modal.classList.contains("open") || editing || !currentParsed.length) return;
    const nodes = $$(".lyric-line", body);
    let activeIdx = -1;
    nodes.forEach((n, i) => {
      const time = parseFloat(n.dataset.time);
      if (!isNaN(time) && time <= currentTime) activeIdx = i;
    });
    nodes.forEach((n, i) => n.classList.toggle("current", i === activeIdx && activeIdx >= 0));
    if (activeIdx >= 0 && nodes[activeIdx]) {
      nodes[activeIdx].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });

  return { open, close };
}
