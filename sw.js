// FXトレード管理パネル - Service Worker
// ネットワーク優先（常に最新版を取りに行き、失敗した時だけキャッシュを使う）。
// 更新のたびにキャッシュが古くなって困る、という事態を避けるための方針。
const CACHE_NAME = 'fx-panel-v2';
const APP_SHELL = [
  './',
  './index.html',
  './risk_panel.html',
  './analysis_panel.html',
  './character_panel.html',
  './common.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './character_assets/cat-happy.png',
  './character_assets/cat-sad.png',
  './character_assets/cat-neutral.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Googleスプレッドシートへのリクエストはキャッシュ対象外（常に最新データを取得）
  if (event.request.url.includes('docs.google.com')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
