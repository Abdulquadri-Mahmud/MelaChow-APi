import express from "express";
import { getActivePromos } from "../../controller/promo/publicPromo.controller.js";
import optionalAuth from "../../middleware/optionalAuth.middleware.js";

const router = express.Router();

// Public — no auth required
router.get("/active", optionalAuth, getActivePromos);

export default router;
