const CACHE = "ncl-public-v1";
const ALLOW = ["/api/public/fixtures", "/api/public/meta", "/api/public/match-day", "/2026/fixtures", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/offline.html"])));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/captain") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/captain") || url.pathname.startsWith("/api/admin") || url.pathname.startsWith("/api/receipts")) {
    return;
  }
  if (!ALLOW.includes(url.pathname)) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return cache.match("/offline.html");
    throw new Error("offline");
  }
}
