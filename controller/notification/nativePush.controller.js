import { usePostgresNotificationWrites } from "../../services/postgres/compat.js";
import { notificationRepository } from "../../services/postgres/notification.repository.js";

function actor(req) {
  return req.vendor ? { role: "vendor", id: req.vendor._id } : { role: "user", id: req.userId };
}

export async function registerNativePushToken(req, res) {
  try {
    const { role, id } = actor(req);
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const platform = req.body?.platform || "android";
    if (!token || token.length > 4096 || !["android", "ios"].includes(platform)) {
      return res.status(400).json({ message: "A valid FCM token and supported platform are required." });
    }
    if (!usePostgresNotificationWrites()) {
      return res.status(503).json({ message: "Native push token storage is not enabled for this API environment." });
    }
    await notificationRepository.saveNativePushToken(role, id, token, platform, req.body?.deviceId || null);
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Native push token registration failed:", error.message);
    return res.status(500).json({ message: "Could not register this device for notifications." });
  }
}

export async function removeNativePushToken(req, res) {
  try {
    const { role, id } = actor(req);
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token || token.length > 4096) return res.status(400).json({ message: "A valid FCM token is required." });
    if (!usePostgresNotificationWrites()) return res.status(503).json({ message: "Native push token storage is not enabled for this API environment." });
    await notificationRepository.removeNativePushToken(role, id, token);
    return res.json({ success: true });
  } catch (error) {
    console.error("Native push token removal failed:", error.message);
    return res.status(500).json({ message: "Could not remove this device notification token." });
  }
}
