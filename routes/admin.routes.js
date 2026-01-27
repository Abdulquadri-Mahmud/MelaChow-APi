// routes/admin.routes.js
import express from 'express';
import auth from '../middleware/auth.middleware.js';
import isAdmin from '../middleware/role.middleware.js';

const router = express.Router();

router.use(auth, isAdmin);

// router.post("/transaction/create",createTransaction);

// router.patch("/transaction/update/:id", updateTransaction);
// router.delete("/transaction/delete/:id", deleteTransaction);
// All admin routes protected

export default router;