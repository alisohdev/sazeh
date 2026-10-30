// Retire app-shell caches installed by older releases. New releases use the network directly.
export async function retireServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    if (registration.scope === new URL(import.meta.env.BASE_URL, location.origin).href)
      await registration.unregister();
  }
  if ("caches" in window)
    for (const key of await caches.keys()) if (key.startsWith("workbox-")) await caches.delete(key);
}
