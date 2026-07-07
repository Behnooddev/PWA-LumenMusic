/**
 * pages/about.js
 */

import { el, clearNode } from "../utils/dom.js";
import { t } from "../services/i18nService.js";

export function renderAbout(container) {
  clearNode(container);

  container.appendChild(el("div", { class: "page-head" }, [
    el("h1", {}, t("about.title")),
    el("p", { class: "sub" }, t("about.subtitle")),
  ]));

  container.appendChild(el("div", { class: "panel glass about-panel" }, [
    el("p", {}, t("about.description1")),
    el("p", {}, t("about.description2")),
  ]));

  container.appendChild(el("div", { class: "panel glass" }, [
    el("div", { class: "panel-title" }, t("about.architectureTitle")),
    el("p", { class: "panel-hint" }, t("about.architectureBody")),
  ]));

  const sourceLink = el("a", {
    class: "link",
    href: "https://github.com/your-username/lumen-music-player",
    target: "_blank",
    rel: "noopener",
  }, "github.com/your-username/lumen-music-player");

  container.appendChild(el("div", { class: "panel glass" }, [
    el("div", { class: "panel-title" }, t("about.source")),
    sourceLink,
  ]));

  const authorLink = el("a", {
    class: "link",
    href: "https://github.com/Behnooddev",
    target: "_blank",
    rel: "noopener",
  }, "github.com/Behnooddev");

  container.appendChild(el("div", { class: "panel glass" }, [
    el("div", { class: "panel-title" }, "Created by"),
    el("p", { class: "panel-hint", style: "margin-bottom:6px;" }, "Behnood Shafiei"),
    authorLink,
  ]));

  container.appendChild(el("div", { class: "panel glass" }, [
    el("div", { class: "panel-title" }, t("about.license")),
    el("p", { class: "panel-hint" }, "MIT — see LICENSE"),
  ]));
}
