import { api } from "./api/client";

// Web Push requires the VAPID public key as a Uint8Array, but the backend
// hands it out as a base64url string — this is the standard conversion.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function getPushSubscriptionState(): Promise<"subscribed" | "not-subscribed" | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return "not-subscribed";
  const existing = await registration.pushManager.getSubscription();
  return existing ? "subscribed" : "not-subscribed";
}

/**
 * Asks the browser for notification permission (this is the one moment a
 * real permission prompt appears — always in direct response to the user
 * tapping an explicit "Enable Notifications" button, never on page load).
 */
export async function subscribeToPush(token: string): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("This browser doesn't support push notifications.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api.getVapidPublicKey(token);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  await api.subscribePush(
    {
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    token
  );
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.unsubscribePush(endpoint, token).catch(() => {
    /* if this fails, the backend will just clean it up next time a push bounces */
  });
}
