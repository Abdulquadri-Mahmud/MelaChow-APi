import express from "express";
import multer from "multer";
import {
  createMeat,
  getMeats,
  updateMeat,
  deleteMeat,
} from "../controllers/meatController.js";

const router = express.Router();

// Setup multer for local temporary storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "tmp/"), // temp folder
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// CRUD routes
router.post("/", upload.single("image"), createMeat);
router.get("/", getMeats);
router.put("/:id", upload.single("image"), updateMeat);
router.delete("/:id", deleteMeat);

export default router;
