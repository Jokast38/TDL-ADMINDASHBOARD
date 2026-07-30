// Service worker minimal pour les notifications push (nouveaux leads/rappels
// assignés). Ne gère volontairement pas le cache/offline — seul le push
// est demandé ici, pas un mode PWA complet.

self.addEventListener("push", (event) => {
  let data = { title: "TDL Formation", body: "Nouvelle notification", url: "/admin" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) { /* payload non-JSON, on garde les valeurs par défaut */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png",
      badge: "https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png",
      data: { url: data.url || "/admin" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
