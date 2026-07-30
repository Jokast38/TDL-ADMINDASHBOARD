import { api } from "@/lib/api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushSubscriptionStatus() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? "subscribed" : "not-subscribed";
}

export async function enablePushNotifications() {
  if (!pushSupported()) throw new Error("Notifications push non supportées par ce navigateur");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission refusée");

  const reg = await navigator.serviceWorker.register("/sw.js");
  const { data } = await api.get("/push/vapid-public-key");
  if (!data.key) throw new Error("Clé VAPID non configurée côté serveur");

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.key),
  });
  await api.post("/push/subscribe", { subscription: subscription.toJSON() });
  return subscription;
}

export async function disablePushNotifications() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}
