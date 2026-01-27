import express from "express";
import authVendor from "../../middleware/vendor.middleware.js";
import { 
    completeVendorOrder, 
    getVendorOrders, 
    getVendorOrdersByStatus, 
    updateVendorOrderStatus 
} from "../../controller/order/orderController.js";

const router = express.Router();

router.get("/orders", authVendor, getVendorOrders);
router.get("/orders/status", authVendor, getVendorOrdersByStatus);

router.put("/orders/:vendorOrderId", authVendor, updateVendorOrderStatus);

router.put("/orders/:vendorOrderId/complete", authVendor, completeVendorOrder);

export default router;
