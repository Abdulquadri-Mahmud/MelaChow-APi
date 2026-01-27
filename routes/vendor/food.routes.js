import express from "express";
import {
  createFood,
  deleteFood,
  getFoodById,
  getFoods,
  updateFood
} from "../../controller/vendor/food.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";

const router = express.Router();

router.post("/create", vendorAuth, createFood); // /api/food/create
router.get("/get-foods", getFoods); // /api/food?vendorId=123
router.get("/get-food", getFoodById);
router.patch("/update-food", vendorAuth, updateFood);
router.delete("/delete-food", vendorAuth, deleteFood);

export default router;