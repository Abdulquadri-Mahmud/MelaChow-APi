import express from "express";
import { adminAuth } from "../../middleware/adminAuth.js";
import {
  listPlatformDeliveryPromos,
  createPlatformDeliveryPromo,
  deactivatePlatformDeliveryPromo,
  updatePlatformDeliveryPromo,
  getPlatformPromoStats,
} from "../../controller/Admin/platformPromo.controller.js";

const router = express.Router();

router.get("/platform-delivery", adminAuth, listPlatformDeliveryPromos);
router.post("/platform-delivery", adminAuth, createPlatformDeliveryPromo);
router.patch("/platform-delivery/:promoId/deactivate", adminAuth, deactivatePlatformDeliveryPromo);
router.get("/platform-delivery/:promoId/stats", adminAuth, getPlatformPromoStats);
router.patch("/platform-delivery/:promoId", adminAuth, updatePlatformDeliveryPromo);

export default router;
