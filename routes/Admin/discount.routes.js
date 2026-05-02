import express from "express";
import {
  activateDiscount,
  createDiscount,
  deactivateDiscount,
  deleteDiscount,
  getDiscounts,
  updateDiscount,
} from "../../controller/discount/discount.controller.js";
import { adminAuth } from "../../middleware/adminAuth.js";

const router = express.Router();

router.get("/", adminAuth, getDiscounts);
router.post("/", adminAuth, createDiscount);
router.patch("/:id", adminAuth, updateDiscount);
router.patch("/:id/activate", adminAuth, activateDiscount);
router.patch("/:id/deactivate", adminAuth, deactivateDiscount);
router.delete("/:id", adminAuth, deleteDiscount);

export default router;
