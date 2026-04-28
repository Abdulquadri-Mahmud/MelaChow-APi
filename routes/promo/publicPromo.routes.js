import express from "express";
import { getActivePromos } from "../../controller/promo/publicPromo.controller.js";

const router = express.Router();

// Public — no auth required
router.get("/active", getActivePromos);

export default router;
