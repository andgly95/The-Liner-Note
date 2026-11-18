/* The Liner Note — service worker.
 *
 * Hand-written, no build step. What it does:
 *   - pages: network first; the last copy of every page you opened is kept, so
 *     the app opens offline, and a page you never opened gets /offline.
 *   - /_next/static: cache first — the file names are content hashes.
 *   - Cover Art Archive images: cache first, fetched with CORS so the cache
 *     holds real bytes (opaque responses cost ~7MB of quota each in Chrome).
 *     Discogs images aren't touched — no CORS there; the HTTP cache keeps them.
 *   - the shelf display's covers come from the Pi (/api/shelf/TOKEN/img/…):
 *     cache first, like any image — a tablet keeps the whole wall.
 *   - catalogue and profile reads (/api/albums, /api/artists, /api/users,
 *     /api/activity, /api/me) and the shelf display's reads (/api/shelf/TOKEN,
 *     its release pages): network first, cached copy when offline — a shelf
 *     tablet rides out the Wi-Fi dropping.
 *   - everything else (auth, AI streams, Discogs, every POST): untouched.
 * Signing in or out wipes the cached API reads: they are one person's view.
 *
 * Bump VERSION when this file's caching logic changes; old caches are dropped
 * on activate. A deploy alone needs no bump — static files are hashed and
 * pages are network first.
 */
const VERSION = "v2";
const PAGES = `ln-pages-${VERSION}`;
const STATIC = `ln-static-${VERSION}`;
const IMAGES = `ln-images-${VERSION}`;
const API = `ln-api-${VERSION}`;
const KEEP = [PAGES, STATIC, IMAGES, API];
// Images: a shelf display wants every cover of a collection to hand.
const LIMITS = { [PAGES]: 60, [STATIC]: 400, [IMAGES]: 1500, [API]: 300 };

const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png"];

// Hosts that send CORS headers, so their images can be cached as real bytes.
// Discogs' image server sends none: asking it with CORS failed and then asked
// again, doubling every request to a host that answers bursts with 429. Its
// covers are left to the browser's HTTP cache (a year's max-age).
const IMAGE_HOSTS = ["coverartarchive.org", "archive.org"];
const API_READS = /^\/api\/(albums\/(?!search)[^/]+$|artists\/[^/]+$|users\/[^/]+$|activity$|me$|shelf\/[a-z0-9]{10}(\/release\/\d+)?$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      await cache.addAll(PRECACHE);
      // The offline page needs its CSS and fonts even if nothing else was ever
      // opened: take every /_next/static file it references.
      try {
        const html = await (await cache.match(OFFLINE_URL)).text();
        const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || [])];
        const s = await caches.open(STATIC);
        await Promise.all(assets.map((u) => s.add(u).catch(() => {})));
      } catch {}
    })()
  );
  // No skipWaiting here: the page asks for it when the person taps "Reload",
  // so a new version never swaps code under a half-filled form.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("ln-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data === "clear-personal") event.waitUntil(caches.delete(API));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Any auth traffic means the person may be changing: forget their API reads.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/auth/")) {
    event.waitUntil(caches.delete(API));
    return;
  }
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(page(event));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(req, STATIC));
    } else if (url.pathname.startsWith("/_next/image") || /^\/api\/shelf\/[a-z0-9]{10}\/img\//.test(url.pathname)) {
      // (the shelf's covers, kept on the Pi: real bytes, so the tablet keeps them too)
      event.respondWith(cacheFirst(req, IMAGES));
    } else if (API_READS.test(url.pathname)) {
      event.respondWith(networkFirst(req, API));
    }
    return;
  }

  if (req.destination === "image" && IMAGE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) {
    event.respondWith(image(req));
  }
});

async function page(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  try {
    const res = (await event.preloadResponse) || (await fetch(req));
    // Only plain successful pages: not redirects to Discogs, not error pages.
    if (res.ok && res.type === "basic" && !new URL(req.url).pathname.startsWith("/api/")) {
      event.waitUntil(cache.put(req, res.clone()).then(() => trim(PAGES)));
    }
    return res;
  } catch {
    return (
      (await cache.match(req, { ignoreSearch: false })) ||
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).then(() => trim(name)).catch(() => {});
  return res;
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).then(() => trim(name)).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function image(req) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
    if (res.ok) cache.put(req.url, res.clone()).then(() => trim(IMAGES)).catch(() => {});
    return res;
  } catch {
    // No CORS on this host (or offline): let the browser do what it would have.
    return fetch(req);
  }
}

// Oldest entries first: Cache keys come back in insertion order.
async function trim(name) {
  const max = LIMITS[name];
  if (!max) return;
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
