/* =========================================================
   Lumen — sw.js
   Cache-first for the app shell (HTML, CSS, JS modules, locales,
   icons), so the app keeps working offline after the first load.
   Imported songs live in IndexedDB, not behind network requests,
   so there is no user media to precache here.
   ========================================================= */

const CACHE_NAME = "lumen-shell-v6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./version.json",
  "./src/styles/main.css",
  "./src/main.js",
  "./src/database/db.js",
  "./src/services/audioEngine.js",
  "./src/services/coverService.js",
  "./src/services/i18nService.js",
  "./src/services/importService.js",
  "./src/services/lmpService.js",
  "./src/services/metadataService.js",
  "./src/services/phoneMusicService.js",
  "./src/services/sleepTimerService.js",
  "./src/services/sortService.js",
  "./src/services/themeService.js",
  "./src/services/transferService.js",
  "./src/services/updateService.js",
  "./src/services/visualizerService.js",
  "./src/pages/about.js",
  "./src/pages/favorites.js",
  "./src/pages/home.js",
  "./src/pages/library.js",
  "./src/pages/phoneMusic.js",
  "./src/pages/playlists.js",
  "./src/pages/settings.js",
  "./src/components/emptyState.js",
  "./src/components/importPanel.js",
  "./src/components/lmpDialog.js",
  "./src/components/lyricsModal.js",
  "./src/components/miniPlayer.js",
  "./src/components/playerSheet.js",
  "./src/components/sideMenu.js",
  "./src/components/songRow.js",
  "./src/components/sortControl.js",
  "./src/components/updateDialog.js",
  "./src/utils/dom.js",
  "./src/utils/format.js",
  "./src/utils/id.js",
  "./src/utils/zip.js",
  "./src/utils/inflate.js",
  "./src/utils/platform.js",
  "./src/utils/semver.js",
  "./src/locales/en.json",
  "./src/locales/fa.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/maskable-512.png",
];

// Lets the update flow (services/updateService.js) force this worker
// to activate immediately instead of waiting for all tabs to close.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch((err) => console.warn("SW: skip", url, err)))
      )
    )
  );
  // Deliberately no self.skipWaiting() here: once a previous version is
  // already controlling the page, a newly-installed worker should wait
  // until the user explicitly chooses "Update now" (see
  // services/updateService.js), rather than silently taking over.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Cache-busted requests (e.g. version.json?t=...) are meant to always
  // hit the network — caching them would both defeat their purpose and
  // pollute the cache with one entry per timestamp forever.
  const isCacheBusted = url.search.length > 0 && url.origin === self.location.origin;

  if (isCacheBusted) {
    event.respondWith(fetch(request).catch(() => caches.match(request.url.split("?")[0])));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === "navigate") return caches.match("./index.html");
        });
    })
  );
});
