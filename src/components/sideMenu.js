/**
 * components/sideMenu.js
 * ---------------------------------------------------------------
 * Slide-out navigation. Markup lives in index.html; this wires up
 * open/close, focus handling, and reports navigation to the router
 * in main.js.
 * ---------------------------------------------------------------
 */

import { $, $$ } from "../utils/dom.js";

export function initSideMenu({ onNavigate }) {
  const menuToggle = $("#menuToggle");
  const sideMenu = $("#sideMenu");
  const scrim = $("#scrim");
  const menuItems = $$(".menu-item", sideMenu);

  function open() {
    sideMenu.classList.add("open");
    scrim.classList.add("open");
    sideMenu.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");
    menuItems[0]?.focus();
  }

  function close() {
    sideMenu.classList.remove("open");
    scrim.classList.remove("open");
    sideMenu.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
  }

  menuToggle.addEventListener("click", () => {
    sideMenu.classList.contains("open") ? close() : open();
  });
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sideMenu.classList.contains("open")) close();
  });

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      setActive(item.dataset.page);
      onNavigate(item.dataset.page);
      close();
    });
  });

  function setActive(page) {
    menuItems.forEach((m) => m.classList.toggle("active", m.dataset.page === page));
  }

  return { open, close, setActive };
}
