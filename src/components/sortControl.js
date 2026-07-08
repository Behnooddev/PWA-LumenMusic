/**
 * components/sortControl.js
 * ---------------------------------------------------------------
 * A compact "Sort: A → Z ▾" button that opens a small menu of every
 * SORT_METHOD. One instance per list (Library, Favorites, a
 * playlist's detail view, Phone Music) — each persists its own
 * preference via sortService's `context` key.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { t } from "../services/i18nService.js";
import { getSortPreference, setSortPreference } from "../services/sortService.js";

const LABEL_KEYS = {
  az: "sort.az", za: "sort.za", artist: "sort.artist", album: "sort.album",
  recentlyAdded: "sort.recentlyAdded", oldestAdded: "sort.oldestAdded",
  mostPlayed: "sort.mostPlayed", leastPlayed: "sort.leastPlayed",
  duration: "sort.duration", custom: "sort.custom",
};

/**
 * Builds the control and returns { element, getMethod() }. `onChange(method)`
 * fires whenever the user picks a different sort — the caller re-renders
 * its list using sortSongs(list, method).
 */
export function createSortControl(context, { onChange, fallback = "recentlyAdded", methods = Object.keys(LABEL_KEYS) } = {}) {
  const wrap = el("div", { class: "sort-control" });
  const button = el("button", { class: "sort-control-btn" }, t("sort.label"));
  const menu = el("div", { class: "sort-menu" });
  wrap.append(button, menu);

  let currentMethod = fallback;
  let open = false;

  function renderMenu() {
    clearNode(menu);
    methods.forEach((method) => {
      const item = el("button", {
        class: `sort-menu-item${method === currentMethod ? " active" : ""}`,
      }, t(LABEL_KEYS[method] || method));
      item.addEventListener("click", async () => {
        currentMethod = method;
        await setSortPreference(context, method);
        button.textContent = `${t("sort.label")}: ${t(LABEL_KEYS[method])}`;
        closeMenu();
        onChange?.(method);
      });
      menu.appendChild(item);
    });
  }

  function openMenu() { open = true; menu.classList.add("open"); renderMenu(); }
  function closeMenu() { open = false; menu.classList.remove("open"); }

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    open ? closeMenu() : openMenu();
  });
  document.addEventListener("click", () => { if (open) closeMenu(); });

  (async () => {
    const saved = await getSortPreference(context, fallback);
    button.textContent = `${t("sort.label")}: ${t(LABEL_KEYS[saved] || saved)}`;
    if (saved !== currentMethod) {
      currentMethod = saved;
      // The caller may have already rendered its list using the
      // synchronous default before this async load resolved — re-run
      // onChange so the list actually reflects the saved preference,
      // not just the button's label.
      onChange?.(currentMethod);
    }
  })();

  return {
    element: wrap,
    getMethod: () => currentMethod,
  };
}
