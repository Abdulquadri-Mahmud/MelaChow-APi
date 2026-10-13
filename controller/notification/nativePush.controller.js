import { usePostgresNotificationWrites } from "../../services/postgres/compat.js";
import { notificationRepository } from "../../services/postgres/notification.repository.js";
import PushSubscription from "../../model/notification/pushSubscription.model.js";
import VendorPushSubscription from "../../model/notification/vendorPushSubscription.model.js";

function actor(req) {
  return req.vendor ? { role: "vendor", id: req.vendor._id } : { role: "user", id: req.userId };
}

export async function registerNativePushToken(req, res) {
  try {
    const { role, id } = actor(req);
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const platform = req.body?.platform || "android";
    const deviceId = req.body?.deviceId == null ? null : typeof req.body.deviceId === "string" ? req.body.deviceId.trim() : false;
    if (!token || token.length > 4096 || !["android", "ios"].includes(platform) || deviceId === false || deviceId?.length > 200) {
      return res.status(400).json({ message: "A valid FCM token and supported platform are required." });
    }
    if (usePostgresNotificationWrites()) {
      await notificationRepository.saveNativePushToken(role, id, token, platform, deviceId || null);
    } else {
      const model = role === "vendor" ? VendorPushSubscription : PushSubscription;
      const ownerField = role === "vendor" ? "vendorId" : "userId";
      await model.findOneAndUpdate(
        { "subscription.endpoint": `fcm:${token}` },
        { $set: { [ownerField]: id, subscription: { endpoint: `fcm:${token}`, provider: "firebase", fcmToken: token, platform, deviceId: deviceId || null }, deviceType: "mobile" } },
        // Payload fields are validated above. Mongoose update validators run
        // with a Query context, where the web-key conditional cannot inspect
        // the Firebase provider reliably.
        { upsert: true, new: true, runValidators: false },
      );
    }
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
    if (usePostgresNotificationWrites()) {
      await notificationRepository.removeNativePushToken(role, id, token);
    } else {
      const model = role === "vendor" ? VendorPushSubscription : PushSubscription;
      const ownerField = role === "vendor" ? "vendorId" : "userId";
      await model.deleteOne({ [ownerField]: id, "subscription.endpoint": `fcm:${token}` });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Native push token removal failed:", error.message);
    return res.status(500).json({ message: "Could not remove this device notification token." });
  }
}
