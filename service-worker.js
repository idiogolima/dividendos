const CACHE_NAME = "dividendos-pwa-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./acoes.html",
  "./ranking.html",
  "./acoes-ranking.html",
  "./etfs.html",
  "./etfs-ranking.html",
  "./styles.css",
  "./app.js",
  "./ranking.js",
  "./etf-app.js",
  "./etf-ranking.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-maskable.svg",
  "./data/ranking-source.json",
  "./data/etfs-manifest.json",
  "./data/etfs-ranking-source.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (shouldCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (_error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    if (request.mode === "navigate") {
      return getNavigationFallback(request);
    }

    throw _error;
  }
}

function shouldCache(response) {
  return response.ok && response.type === "basic";
}

async function getNavigationFallback(request) {
  const url = new URL(request.url);

  if (url.pathname.endsWith("/ranking.html") || url.pathname.endsWith("/acoes-ranking.html")) {
    return caches.match("./acoes-ranking.html");
  }

  if (url.pathname.endsWith("/etfs-ranking.html")) {
    return caches.match("./etfs-ranking.html");
  }

  if (url.pathname.endsWith("/acoes.html")) {
    return caches.match("./acoes.html");
  }

  if (url.pathname.endsWith("/etfs.html")) {
    return caches.match("./etfs.html");
  }

  return caches.match("./index.html");
}
