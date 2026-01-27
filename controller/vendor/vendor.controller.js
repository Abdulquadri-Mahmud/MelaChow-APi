import { sendVendorAccountCreatedEmail } from "../../config/vendorAccountCreated.mailer.js";
import Food from "../../model/vendor/food.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";
import walletMode from "../../model/wallet/wallet.mode.js";
import VendorOrder from "../../model/vendor/VendorOrder.js";

// ----------------------------------------------
// ✅ CREATE NEW VENDOR WITH AUTO WALLET CREATION
// ----------------------------------------------
export const createVendor = async (req, res) => {
  try {

    const vendorData = req.body;

    const vendor = await vendorModel.create(vendorData);

    const wallet = await walletMode.create({
      ownerId: vendor._id,           // Link wallet to this vendor
      ownerModel: "Vendor",          // Indicates this wallet belongs to a vendor
      balance: 0,                    // Initial balance is 0
      totalEarnings: 0,                // No earnings yet
      totalWithdrawn: 0              // No withdrawals yet
    });

    // 4️ Update the vendor document with wallet reference
    vendor.wallet = wallet._id;      // Link wallet ID to vendor
    await vendor.save();

    await sendVendorAccountCreatedEmail(vendor);// Save vendor again to persist wallet ID

    // 5 Return success response with clean vendor profile
    // Using instance method getPublicProfile() to exclude sensitive data
    res.status(201).json({
      success: true,
      message: "Vendor account created successfully. A confirmation email has been sent to your registered email address. Please check your inbox for details. Your account will be reviewed by our admin team, and you’ll be notified within 24 hours once it’s verified. You’ll be able to log in to your dashboard after approval.",
      data: vendor.getPublicProfile(), // Return only public-facing data
    });

  } catch (error) {
    // Error handling
    console.error("Error creating vendor:", error.message);
    res.status(500).json({
      success: false,
      message: "Error creating vendor",
      error: error.message,
    });
  }
};

// ---------------------------------
// GET SINGLE VENDOR BY ID OR SLUG
// ---------------------------------

export const getVendorById = async (req, res) => {
  try {
    // Security: ONLY use authenticated vendor ID from JWT token
    // This route is protected by vendorAuth middleware
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const id = req.vendor._id;

    // 1. Find vendor by MongoDB ObjectId
    const vendor = await vendorModel.findById(id).lean();

    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    // 2. Fetch Wallet
    const wallet = await walletMode.findOne({ ownerId: vendor._id }).lean();

    // 3. Fetch Vendor Orders
    const vendorOrders = await VendorOrder.find({ restaurantId: vendor._id })
      .populate({
        path: "userOrderId",
        populate: {
          path: "userId",
          select: "fullName firstname lastname phone email avatar",
        },
      })
      .lean();

    // 4. Merge data
    vendor.wallet = wallet || null;
    vendor.vendorOrders = vendorOrders || [];

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving vendor",
      error: error.message,
    });
  }
};

// ✅ Get vendor and its foods for user display
export const getVendorForUserDisplay = async (req, res) => {
  try {
    const { id } = req.query;

    // Find vendor by ObjectId or slug
    const vendor = await vendorModel
      .findOne({
        $or: [{ _id: id }, { storeSlug: id }],
      })
      .select("storeName fullAddress storeDescription address logo email phone openingHours acceptsDelivery rating ratingCount estimatedDeliveryTime deliveryFee")
      .lean(); // lean makes it return a plain JS object

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // ✅ Fetch all foods created by this vendor
    const foods = await Food
      .find({ vendor: vendor._id })
      .select("name images price categories available description variants")
      .sort({ createdAt: -1 });

    // ✅ Combine vendor and foods in one response
    res.status(200).json({
      success: true,
      data: {
        vendor,
        foods,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving vendor",
      error: error.message,
    });
  }
};


// ---------------------------------
// UPDATE VENDOR
// ---------------------------------
export const updateVendor = async (req, res) => {
  try {
    // Security: ONLY use authenticated vendor ID from JWT token
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const id = req.vendor._id;
    const updates = req.body;

    const vendor = await vendorModel.findByIdAndUpdate(
      id,
      { $set: updates }, // <-- Important: allows partial nested updates
      { new: true, runValidators: true }
    );

    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    res.status(200).json({
      success: true,
      message: "Vendor updated successfully",
      data: vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating vendor",
      error: error.message,
    });
  }
};

// ---------------------------------
// DELETE VENDOR (Soft Delete)
// ---------------------------------
export const deleteVendor = async (req, res) => {
  try {
    // Security: ONLY use authenticated vendor ID from JWT token
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const id = req.vendor._id;

    // mark as deleted instead of permanent removal
    const vendor = await vendorModel.findByIdAndUpdate(
      id,
      { deletedAt: new Date(), active: false },
      { new: true }
    );

    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    res.status(200).json({
      success: true,
      message: "Vendor soft-deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting vendor",
      error: error.message,
    });
  }
};

// ---------------------------------
// RESTORE DELETED VENDOR
// ---------------------------------
export const restoreVendor = async (req, res) => {
  try {
    // Security: ONLY use authenticated vendor ID from JWT token
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const id = req.vendor._id;

    // restore by nulling deletedAt
    const vendor = await vendorModel.findByIdAndUpdate(
      id,
      { deletedAt: null, active: true },
      { new: true }
    );

    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    res.status(200).json({
      success: true,
      message: "Vendor restored successfully",
      data: vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error restoring vendor",
      error: error.message,
    });
  }
};

// ---------------------------------
// GET NEARBY VENDORS (Geo Query)
// ---------------------------------
export const getNearbyVendors = async (req, res) => {
  try {
    const { lng, lat, radius = 5 } = req.query; // radius in km

    if (!lng || !lat)
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude are required",
      });

    // Geolocation coordinates are no longer supported. 
    // This endpoint is kept for backward compatibility but returns an empty list.
    const vendors = [];

    res.status(200).json({
      success: true,
      count: vendors.length,
      data: vendors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching nearby vendors",
      error: error.message,
    });
  }
};

// ---------------------------------
// GET WALLET FOR VENDOR
// ---------------------------------
export const getWalletForVendor = async (req, res) => {
  try {
    // Security: ONLY use authenticated vendor ID from JWT token
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const id = req.vendor._id;

    const vendor = await vendorModel.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const wallet = await walletMode.findOne({ ownerId: id });
    if (!wallet) {
      // Optional: Create a wallet if it doesn't exist?
      // For now, we'll just return not found or null
      return res.status(404).json({
        success: false,
        message: "Wallet not found for this vendor",
      });
    }

    res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching wallet",
      error: error.message,
    });
  }
};

// ---------------------------------
// GET ALL ORDERS FOR VENDOR
// ---------------------------------
export const getVendorOrders = async (req, res) => {
  try {
    // Security: ONLY use authenticated vendor ID from JWT token
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const id = req.vendor._id;

    const vendor = await vendorModel.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const vendorOrders = await VendorOrder.find({ restaurantId: id })
      .populate({
        path: "userOrderId",
        populate: {
          path: "userId",
          select: "fullName firstname lastname phone email avatar",
        },
      })
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    res.status(200).json({
      success: true,
      data: vendorOrders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching vendor orders",
      error: error.message,
    });
  }
};

// ---------------------------------
// GET SINGLE VENDOR ORDER BY ID
// ---------------------------------
export const getVendorOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    const vendorOrder = await VendorOrder.findById(orderId)
      .populate({
        path: "userOrderId",
        populate: {
          path: "userId",
          select: "fullName firstname lastname phone email avatar",
        },
      })
      .lean();

    if (!vendorOrder) {
      return res.status(404).json({
        success: false,
        message: "Vendor order not found",
      });
    }

    // Security check: Ensure order belongs to authenticated vendor
    if (req.vendor && vendorOrder.restaurantId.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to order",
      });
    }



    res.status(200).json({
      success: true,
      data: vendorOrder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching vendor order",
      error: error.message,
    });
  }
};

// ---------------------------------
// UPDATE VENDOR ORDER STATUS
// ---------------------------------
export const updateVendorOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = [
      "pending",            // Customer placed order, not yet accepted
      "accepted",           // Vendor accepted the order
      "preparing",          // Kitchen is preparing the food
      "ready_for_pickup",   // Food is ready for rider
      "rider_assigned",     // Delivery rider has been assigned
      "out_for_delivery",   // Rider picked up the food
      "delivered",          // Customer received the order
      "completed",         // Order closed & paid out
      "cancelled",         // Order was cancelled
      "failed",            // Payment or delivery failed
      "refunded"           // Money returned to customer
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status provided",
      });
    }

    // First, find the Order by the generated orderId
    const Order = (await import("../../model/order/Order.js")).default;
    const userOrder = await Order.findOne({ orderId });

    if (!userOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update the VendorOrder using the userOrder's _id
    const query = { userOrderId: userOrder._id };
    // Security check: Ensure order belongs to authenticated vendor
    if (req.vendor) {
      query.restaurantId = req.vendor._id;
    }

    const vendorOrder = await VendorOrder.findOneAndUpdate(
      query,
      { orderStatus: status },
      { new: true }
    );

    if (!vendorOrder) {
      return res.status(404).json({
        success: false,
        message: "Vendor order not found",
      });
    }

    // Also update the main Order status
    userOrder.orderStatus = status;
    await userOrder.save();

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: vendorOrder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message,
    });
  }
};
