import express from "express";
import { adminAuth } from "../../middleware/adminAuth.js";
import {
  listVendorDeliveryPromos,
  createVendorDeliveryPromo,
  deactivateVendorDeliveryPromo,
  getVendorDeliveryPromo,
} from "../../controller/Admin/vendorPromo.controller.js";

const router = express.Router();

router.get("/vendor-delivery", adminAuth, listVendorDeliveryPromos);
router.post("/vendor-delivery", adminAuth, createVendorDeliveryPromo);
router.get("/vendor-delivery/:promoId", adminAuth, getVendorDeliveryPromo);
router.patch("/vendor-delivery/:promoId/deactivate", adminAuth, deactivateVendorDeliveryPromo);

export default router;
