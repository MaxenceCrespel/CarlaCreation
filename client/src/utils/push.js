import { apiFetch } from '../api/client';

// Web Push wants the VAPID public key as a raw Uint8Array, but it's handed
// out as a URL-safe base64 string — this is the standard conversion (MDN's
// own push-notifications guide uses this exact snippet).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  // getRegistration() resolves to undefined right away if nothing's been
  // registered yet — unlike `serviceWorker.ready`, which stays pending
  // forever until some registration exists, hanging this check forever on
  // a first visit (before "Activer les notifications" is ever clicked).
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Registers the service worker (idempotent — a second call while one's
// already active/registered just resolves immediately), requests
// notification permission, subscribes with the server's VAPID public key,
// and saves the subscription. Throws with a message suitable for direct
// display if any step is refused/unsupported.
export async function enablePushNotifications() {
  if (!pushSupported()) {
    throw new Error("Les notifications ne sont pas prises en charge sur cet appareil/navigateur.");
  }

  const { publicKey } = await apiFetch('/admin/push/public-key');
  if (!publicKey) {
    throw new Error('Les notifications ne sont pas configurées côté serveur.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permission refusée — activez les notifications pour ce site dans les réglages de votre navigateur.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await apiFetch('/admin/push/subscribe', { method: 'POST', body: subscription.toJSON() });
  return subscription;
}

export async function disablePushNotifications() {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  await apiFetch('/admin/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } });
  await subscription.unsubscribe();
}
