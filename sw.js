// Morfi — service worker: la app abre sin conexión; los datos de Notion no pasan por acá.
const VERSION = "morfi-v1";
const ASSETS = [
  "./", "index.html", "styles.css", "config.js", "notion.js", "logic.js", "app.js", "manifest.webmanifest",
  "fonts/schibsted-latin.woff2", "fonts/schibsted-latin-ext.woff2", "fonts/material-symbols-rounded.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-192.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-64.png",
];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // Notion/Worker calls go straight to the network
  // network first for code (so updates arrive), cache as fallback; cache first for fonts and icons
  const cacheFirst = /\/(fonts|icons)\//.test(url.pathname);
  e.respondWith(cacheFirst
    ? caches.match(e.request).then(r => r || fetch(e.request))
    : fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
