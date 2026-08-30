/* eslint-env serviceworker */
/**
 * Service worker ШАГОВ.
 *
 * Единственная задача — installable app shell и offline launch (SPEC/00
 * §1.1): приложение должно открываться без сети. Задача НЕ включает
 * кэширование пользовательского контента задач — `02_DATA_MODEL_SYNC.md`
 * §4 прямо запрещает это: «Service worker must never upload/cache user
 * task content to CDN cache». Ниже кэшируются только: сама оболочка
 * (`index.html`, манифест) и статические ассеты со content-hash в имени
 * (`/assets/*`, неизменяемые). Ни один запрос к данным задач (когда они
 * появятся — sync/API, `@shagi/storage`, `@shagi/sync`) через этот файл
 * не проходит: IndexedDB не открывается из service worker'а вообще,
 * а любой сетевой путь `/api/*` — специально no-op ниже, до появления
 * самого API, чтобы граница не пришлось переоткрывать явным решением, а не
 * молчаливым «а тут никто и не звал».
 *
 * Файл лежит в `public/` и попадает в сборку как есть — поэтому здесь
 * обычный JS без сборочных зависимостей.
 */

/** Версия кэша — поднять при несовместимом изменении стратегии кэширования. */
const VERSION = 'v1';
const SHELL_CACHE = `shagi-shell-${VERSION}`;
const ASSET_CACHE = `shagi-assets-${VERSION}`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll([SHELL_URL, '/manifest.webmanifest']).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Данные — только сеть, никогда кэш. Пользовательский контент задач
  // приходит через API (появится вместе с @shagi/sync); граница проведена
  // здесь заранее и намеренно, а не задним числом.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  event.respondWith(networkThenCache(request, SHELL_CACHE));
});

/** Обновление применяем только по явной команде (`platform.ts` → `UpdaterPort`). */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

async function networkFirstShell(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(SHELL_URL);
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkThenCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}
