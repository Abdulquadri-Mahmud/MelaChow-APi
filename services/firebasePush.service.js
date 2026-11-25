import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const APP_NAME = "melachow-staging-fcm";
let messagingClient;
let warnedMissingCredentials = false;

function getMessagingClient() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!warnedMissingCredentials) {
      console.warn("[FCM] Firebase service-account credentials are not configured; native push is disabled.");
      warnedMissingCredentials = true;
    }
    return null;
  }

  if (messagingClient) return messagingClient;
  const existing = getApps().find((app) => app.name === APP_NAME);
  const credential = serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault();
  const app = existing || initializeApp({ credential }, APP_NAME);
  messagingClient = getMessaging(app);
  return messagingClient;
}

export async function sendFirebasePush(token, payload) {
  const messaging = getMessagingClient();
  if (!messaging) return false;

  const data = Object.fromEntries(Object.entries(payload.data || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));

  await messaging.send({
    token,
    notification: { title: payload.title || "MelaChow", body: payload.body || "" },
    data,
    android: { notification: { channelId: "melachow_orders", tag: payload.tag } },
  });
  return true;
}

/**
 * Send a high-priority data-only FCM message for incoming/cancelled VoIP calls.
 * Data-only payloads invoke FirebaseMessagingService.onMessageReceived() even
 * when the Android app is backgrounded or terminated, allowing native full-screen
 * incoming call UI and CallStyle notifications without duplicate system banners.
 */
export async function sendIncomingCallFirebasePush(token, payload = {}) {
  const messaging = getMessagingClient();
  if (!messaging || !token) return false;

  const data = Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === "string" ? value : String(value)])
  );

  const ttlMs = Math.max(5000, Math.min(60000, Number(payload.ttlMs) || 35000));

  await messaging.send({
    token,
    data,
    android: {
      priority: "high",
      ttl: ttlMs,
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-expiration": String(Math.floor((Date.now() + ttlMs) / 1000)),
      },
      payload: {
        aps: {
          "content-available": 1,
          sound: "default",
        },
      },
    },
  });
  return true;
}
