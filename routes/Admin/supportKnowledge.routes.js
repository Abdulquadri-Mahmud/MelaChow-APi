import express from "express";
import { adminAuth } from "../../middleware/adminAuth.js";
import { createSupportKnowledge, listSupportKnowledge, updateSupportKnowledge } from "../../controller/supportKnowledge.controller.js";

const router = express.Router();
router.get("/knowledge", adminAuth, listSupportKnowledge);
router.post("/knowledge", adminAuth, createSupportKnowledge);
router.patch("/knowledge/:articleId", adminAuth, updateSupportKnowledge);

export default router;
