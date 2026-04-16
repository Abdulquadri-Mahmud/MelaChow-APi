import mongoose from "mongoose";
import { sendVendorAccountCreatedEmail } from "../../config/vendorAccountCreated.mailer.js";
import Food from "../../model/vendor/food.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";
import walletMode from "../../model/wallet/wallet.mode.js";
import VendorOrder from "../../model/vendor/VendorOrder.js";
import Order from "../../model/order/Order.js";
import User from "../../model/user.model.js";
import { validateVendorLocation } from "../../services/locationService.js";
import { redisClient, isRedisReady } from "../../config/redis.js";

// ----------------------------------------------
// ✅ CREATE NEW VENDOR WITH AUTO WALLET CREATION
// ----------------------------------------------
export const createVendor = async (req, res) => {
  try {

    const vendorData = req.body;

    // ========================================
    // LOCATION VALIDATION (NEW)
    // ========================================
    // Extract state and city from address or top-level fields
    const stateName = vendorData.address?.state || vendorData.state;
    const cityName = vendorData.address?.city || vendorData.city;

    let locationData = {
      stateId: null,
      cityId: null,
      locationStatus: null,
      requestedState: "",
      requestedCity: "",
    };

    if (stateName && cityName) {
      try {
        // Validate location against database
        locationData = await validateVendorLocation(stateName, cityName);

        console.log("Location validation result:", locationData);
      } catch (error) {
        console.error("Location validation failed:", error.message);
        // Continue with vendor creation but flag location as pending
        locationData.locationStatus = "pending_review";
        locationData.requestedState = stateName;
        locationData.requestedCity = cityName;
      }
    }

    // Merge location data into vendor payload
    const enrichedVendorData = {
      ...vendorData,
      stateId: locationData.stateId,
      cityId: locationData.cityId,
      locationStatus: locationData.locationStatus,
      requestedState: locationData.requestedState,
      requestedCity: locationData.requestedCity,
      // Keep legacy string fields for backward compatibility
      address: {
        ...vendorData.address,
        state: stateName || "",
        city: cityName || "",
      },
    };

    // ========================================
    // CREATE VENDOR
    // ========================================
    const vendor = await vendorModel.create(enrichedVendorData);

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

    await sendVendorAccountCreatedEmail(vendor);

    // 5 Return success response with clean vendor profile
    // Using instance method getPublicProfile() to exclude sensitive data
    const responseMessage = locationData.locationStatus === "pending_review"
      ? "Vendor account created successfully. Your location is under review by our admin team. A confirmation email has been sent to your registered email address. Please check your inbox for details. Your account will be reviewed by our admin team, and you'll be notified within 24 hours once it's verified. You'll be able to log in to your dashboard after approval."
      : "Vendor account created successfully. A confirmation email has been sent to your registered email address. Please check your inbox for details. Your account will be reviewed by our admin team, and you'll be notified within 24 hours once it's verified. You'll be able to log in to your dashboard after approval.";

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: vendor.getPublicProfile(), // Return only public-facing data
      locationPending: locationData.locationStatus === "pending_review",
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
    const vendor = await vendorModel.findById(id).select("+payoutDetails").lean();

    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    // 2. Fetch Wallet
    const wallet = await walletMode.findOne({ ownerId: vendor._id }).lean();

    // 3. Fetch Vendor Orders (Isolate errors to prevent 500 crashes)
    let vendorOrders = [];
    try {
      vendorOrders = await VendorOrder.find({ restaurantId: vendor._id })
        .populate({
          path: "userOrderId",
          populate: {
            path: "userId",
            select: "fullName firstname lastname phone email avatar",
          },
        })
        .lean();
    } catch (orderError) {
      console.error("❌ Critical error populating vendor orders in getVendorById:");
      console.error(orderError.stack);
      // Fallback to empty array so the vendor still loads
      vendorOrders = [];
    }

    // 4. Merge data
    vendor.wallet = wallet || null;
    vendor.vendorOrders = vendorOrders || [];

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    console.error("💥 SYSTEM CRASH in getVendorById:");
    console.error(error.stack);
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
    const id = req.params.id || req.query.id;

    // Find vendor by ObjectId or slug
    const vendor = await vendorModel
      .findOne({
        $or: [{ _id: id }, { storeSlug: id }],
      })
      .select("storeName fullAddress storeDescription address logo email phone openingHours acceptsDelivery rating ratingCount deliveryRadiusKm")
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

    // Handle nested payoutDetails to prevent overwriting the whole object
    if (updates.payoutDetails) {
      Object.keys(updates.payoutDetails).forEach(key => {
        updates[`payoutDetails.${key}`] = updates.payoutDetails[key];
      });
      delete updates.payoutDetails;
    }

    const vendor = await vendorModel.findByIdAndUpdate(
      id,
      { $set: updates }, 
      { new: true, runValidators: true }
    );

    // Invalidate vendor owners cache if owners were updated
    if (vendor && updates.owners && isRedisReady()) {
      try {
        await redisClient.del(`vendor:${id}:owners`);
        console.log(`🧹 Invalidated owners cache for vendor ${id}`);
      } catch (err) {
        console.warn('⚠️ Failed to invalidate vendor owners cache:', err.message);
      }
    }

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

    let wallet = await walletMode.findOne({ ownerId: id, ownerModel: "Vendor" });
    if (!wallet) {
      // Create a wallet if it doesn't exist
      wallet = await walletMode.create({
        ownerId: id,
        ownerModel: "Vendor",
        balance: 0,
        transactions: []
      });
    }

    const unreleasedEscrow = await VendorOrder.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(id),
          escrowReleased: false,
          orderStatus: { $ne: "cancelled" }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$escrowAmount" }
        }
      }
    ]);

    const pendingBalance = unreleasedEscrow.length > 0 ? unreleasedEscrow[0].total : 0;

    res.status(200).json({
      success: true,
      data: {
        ...wallet.toObject(),
        pendingBalance
      },
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
// GET PAYOUT DETAILS FOR VENDOR
// ---------------------------------
export const getVendorPayoutDetails = async (req, res) => {
  try {
    if (!req.vendor) {
      return res.status(401).json({ success: false, message: "Unauthorized. Authentication required." });
    }

    const vendor = await vendorModel.findById(req.vendor._id).select("+payoutDetails");
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    const details = vendor.payoutDetails;
    const cleanPayoutDetails = details ? {
      bankName: details.bankName || "",
      bankCode: details.bankCode || "",
      accountName: details.accountName || "",
      accountNumber: details.accountNumber || "",
      payoutMethod: details.payoutMethod || "paystack",
      payoutEnabled: details.payoutEnabled || false,
    } : null;

    res.status(200).json({
      success: true,
      payoutDetails: cleanPayoutDetails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching payout details",
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
    const { vendorOrderId } = req.params;

    // ✅ VALIDATION - Enhanced logging
    console.log(`📝 Fetching single vendor order:`, {
      vendorOrderId,
      vendorOrderIdType: typeof vendorOrderId,
      vendorOrderIdLength: vendorOrderId?.length
    });

    // ✅ Validate vendorOrderId exists
    if (!vendorOrderId) {
      console.error('❌ Missing vendorOrderId in request');
      return res.status(400).json({
        success: false,
        message: "Vendor Order ID is required"
      });
    }

    // ✅ Validate MongoDB ObjectId format (24 hex characters)
    if (!vendorOrderId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('❌ Invalid vendorOrderId format:', {
        received: vendorOrderId,
        length: vendorOrderId.length,
        isHex: /^[0-9a-fA-F]+$/.test(vendorOrderId)
      });
      return res.status(400).json({
        success: false,
        message: "Invalid Vendor Order ID format. Expected 24-character MongoDB ObjectId.",
        received: vendorOrderId,
        receivedLength: vendorOrderId.length,
        hint: "Make sure you're sending the MongoDB _id from the VendorOrder document, not the user-facing orderId"
      });
    }

    const vendorOrder = await VendorOrder.findById(vendorOrderId)
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

    // Role-based delivery restrictions
    if (req.vendor) {
      // All deliveries are platform-managed. Vendors must stop at "ready_for_pickup" or cancellation.
      const restrictedStatuses = [
        "rider_assigned",
        "out_for_delivery",
        "delivered",
        "completed"
      ];
      
      if (restrictedStatuses.includes(status)) {
        return res.status(403).json({
          success: false,
          message: `Platform delivery is enabled. You cannot manually update the order to '${status}'. Only riders/admins can perform this action.`
        });
      }
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
