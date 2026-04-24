import express from "express";
import {
    createCategory,
    deleteCategory,
    getAllCategoriesAdmin,
    getCategories,
    updateCategory,
    getPublicCategories,
    getCategoryTree,
    getPlatformCategories
} from "../controller/category.controller.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Public routes
router.get("/public", getPublicCategories);
router.get("/tree", getCategoryTree);
router.get("/", getCategories);
router.get("/platform-categories", getPlatformCategories);

// Admin only routes (Protected by auth middleware)
router.get("/admin/all", adminAuth, getAllCategoriesAdmin);
router.post("/", adminAuth, createCategory);
router.put("/:id", adminAuth, updateCategory);
router.delete("/:id", adminAuth, deleteCategory);

export default router;
