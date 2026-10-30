/* global self, caches */
// One-time retirement worker for browsers with an older cached app shell.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("workbox-")) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" }))
        await client.navigate(client.url);
    })(),
  );
});
