/**
 * services/i18nService.js
 * ---------------------------------------------------------------
 * Loads /src/locales/<lang>.json and applies translations to any
 * element carrying data-i18n / data-i18n-placeholder / data-i18n-aria.
 * Default language is English; Persian flips the document to RTL
 * and switches to a font stack with better Persian shaping.
 * ---------------------------------------------------------------
 */

import { Settings } from "../database/db.js";

const dictionaries = {};
let currentLang = "en";
let currentDict = {};

async function loadDictionary(lang) {
  if (dictionaries[lang]) return dictionaries[lang];
  const res = await fetch(`src/locales/${lang}.json`);
  const dict = await res.json();
  dictionaries[lang] = dict;
  return dict;
}

export function t(key, vars = {}) {
  const raw = key.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), currentDict);
  let str = raw !== undefined ? raw : key;
  Object.entries(vars).forEach(([k, v]) => {
    str = str.replace(new RegExp(`{{${k}}}`, "g"), v);
  });
  return str;
}

export function getLang() {
  return currentLang;
}

function applyToDom() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "fa" ? "rtl" : "ltr";
  document.documentElement.dataset.lang = currentLang;

  document.querySelectorAll("[data-i18n]").forEach((elm) => {
    elm.textContent = t(elm.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((elm) => {
    elm.setAttribute("placeholder", t(elm.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((elm) => {
    elm.setAttribute("aria-label", t(elm.dataset.i18nAria));
  });
}

const listeners = new Set();
export function onLanguageChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function setLanguage(lang) {
  currentDict = await loadDictionary(lang);
  currentLang = lang;
  await Settings.set("language", lang);
  applyToDom();
  listeners.forEach((cb) => cb(lang));
}

export async function initI18n() {
  const saved = await Settings.get("language", "en");
  await setLanguage(saved);
}
