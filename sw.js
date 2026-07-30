/**
 * ═══════════════════════════════════════════════════════════════
 * Diyaa — Service Worker
 * Provides: offline caching so the site keeps working without a
 * connection, automatic version updates, and an Offline page for
 * any page that hasn't been cached yet when the connection drops.
 * ═══════════════════════════════════════════════════════════════
 */

// Bump this with every new deployment to force clients to refresh their cache
const CACHE_VERSION = 'v5';
const STATIC_CACHE = `diyaa-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `diyaa-runtime-${CACHE_VERSION}`;

// self.registration.scope is the real base URL this service worker controls
// (e.g. "https://example.com/" at a domain root, or
// "https://user.github.io/repo-name/" on GitHub Pages). Every cached URL is
// resolved against it instead of a hardcoded "/", so the site works
// correctly whether it's hosted at a domain root or inside a subpath.
const SCOPE = self.registration.scope;
const toURL = (path) => new URL(path, SCOPE).href;

// Page shown when there's no connection and no cached copy of the requested page
const OFFLINE_URL = toURL('offline.html');

// Core assets cached as soon as the service worker installs
const PRECACHE_PATHS = [
  '',
  'offline.html',
  '404.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'js/tools-data.js',
  'js/tools-config.js',
  'js/tools-runtime.js',
  'js/search.js',
  'js/contact.js',
  'tools/',
  'search.html',
  'faq.html',
  'about.html',
  'contact.html',
  'terms.html',
  'privacy-policy.html',
  'tools/jpg-to-png.html',
  'tools/png-to-jpg.html',
  'tools/webp-to-jpg.html',
  'tools/webp-to-png.html',
  'tools/avif-to-jpg.html',
  'tools/avif-to-png.html',
  'tools/heic-to-jpg.html',
  'tools/heic-to-png.html',
  'tools/bmp-to-png.html',
  'tools/gif-to-png.html',
  'tools/svg-to-png.html',
  'tools/tiff-to-jpg.html',
  'tools/image-to-ico.html',
  'tools/image-to-base64.html',
  'tools/resize-image.html',
  'tools/crop-image.html',
  'tools/rotate-image.html',
  'tools/flip-image.html',
  'tools/grayscale-image.html',
  'tools/sepia-image.html',
  'tools/invert-image-colors.html',
  'tools/brightness-contrast.html',
  'tools/saturation-hue.html',
  'tools/blur-image.html',
  'tools/sharpen-image.html',
  'tools/pixelate-image.html',
  'tools/watermark-image.html',
  'tools/remove-exif.html',
  'tools/compress-image.html',
  'tools/image-to-pdf.html',
  'images/icon-72x72.png',
  'images/icon-96x96.png',
  'images/icon-128x128.png',
  'images/icon-144x144.png',
  'images/icon-152x152.png',
  'images/icon-192x192.png',
  'images/icon-384x384.png',
  'images/icon-512x512.png',
  'images/apple-touch-icon.png',
  'images/safari-pinned-tab.svg'
];

const PRECACHE_URLS = PRECACHE_PATHS.map(toURL);

// ─── Install: pre-cache the core assets ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.all(
        // cache each URL individually — one 404 (e.g. a page removed in a
        // future update) shouldn't fail the whole install like addAll() would
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Skipped precaching', url, err))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: delete any old cache from a previous version ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: caching strategy ───
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignore anything that isn't a GET request
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Page navigations (HTML): Network First, falling back to cache, then the Offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Same-origin assets (CSS/JS/images/icons): Stale-While-Revalidate.
  // Everything the site needs is served from this same origin — there
  // are no external CDN or font requests to handle separately.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }
});

// ─── Instant update on request (used by app.js) ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
