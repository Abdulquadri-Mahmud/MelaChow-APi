import express from "express";
import { createDiscount, getDiscounts } from "../../controller/discount/discount.controller.js";
import { adminAuth } from "../../middleware/adminAuth.js";
// Note: I'm assuming adminAuth exists based on file naming in middleware list earlier ("adminAuth.js").
// Let me verify the middleware name.

const router = express.Router();

router.post("/", adminAuth, createDiscount);
router.get("/", adminAuth, getDiscounts);

export default router;
