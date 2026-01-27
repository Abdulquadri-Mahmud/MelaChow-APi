import express from "express";
import { 
  banUser,
  getAllUsers,
  getUserDetails, 
  getUserStats,
  reactivateUser,
  suspendUser
} from "../../../controller/Admin/user_management/user.management.controller.js";
import { adminAuth } from "../../../middleware/adminAuth.js";

const router = express.Router();

router.get("/all", adminAuth, getAllUsers);
router.get("/single", adminAuth, getUserDetails);
router.get("/stats", adminAuth, getUserStats);
router.patch("/suspend", adminAuth, suspendUser);
router.patch("/ban", adminAuth, banUser);
router.patch("/reactivate", adminAuth, reactivateUser);

// router.put("/suspend", superAdminOnly, suspendUser);
// router.put("/ban", superAdminOnly, banUser);
// router.put("/reactivate", superAdminOnly, reactivateUser);

export default router;
