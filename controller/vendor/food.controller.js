import Food from "../../model/vendor/food.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";
import jwt from "jsonwebtoken";

// CREATE FOOD
export const createFood = async (req, res) => {
  try {
    // Security: Use authenticated vendor ID
    // Route is protected by vendorAuth middleware
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const vendorId = req.vendor._id;
    const foodData = req.body;

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    const food = await Food.create({ ...foodData, vendor: vendorId });

    // Link food to vendor
    vendor.foods.push(food._id);
    await vendor.save();

    res.status(201).json({
      success: true,
      message: "Food created successfully",
      data: food,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating food",
      error: error.message,
    });
  }
};

// GET ALL FOODS (optionally filter by vendor)
// GET ALL FOODS (optionally filter by vendor)
export const getFoods = async (req, res) => {
  try {
    let { vendorId } = req.query;

    // 1. If no query param, try to find authenticated vendor from cookie
    if (!vendorId) {
      const token = req.cookies.vendorToken;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          vendorId = decoded.id;
        } catch (err) {
          // Token invalid/expired - ignore it and proceed (result will be empty or error below)
        }
      }
    }

    // Filter by vendor if vendorId is finally determined
    const filter = vendorId ? { vendor: vendorId } : {};

    // Fetch foods + all relevant vendor info
    const foods = await Food.find(filter)
      .populate("vendor", "storeName fullAddress address logo phone openingHours rating") // include key vendor fields
      .lean(); // convert to plain JS objects for faster access

    // Ensure each vendor has an `id` field for frontend consistency
    const formattedFoods = foods.map(food => ({
      ...food,
      vendor: food.vendor
        ? {
          ...food.vendor,
          id: food.vendor._id?.toString(),
        }
        : null,
    }));

    // console.log(filter);
    // console.log(formattedFoods);

    res.status(200).json({
      success: true,
      count: formattedFoods.length,
      data: formattedFoods,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching foods",
      error: error.message,
    });
  }
};

// GET SINGLE FOOD
export const getFoodById = async (req, res) => {
  try {
    const { id } = req.query;
    const food = await Food.findById(id).populate("vendor", "storeName fullAddress address logo phone openingHours acceptsDelivery");

    if (!food)
      return res.status(404).json({ success: false, message: "Food not found" });

    res.status(200).json({
      success: true,
      data: food,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching food",
      error: error.message,
    });
  }
};

// UPDATE FOOD (with support for nested updates)
export const updateFood = async (req, res) => {
  try {
    const { id } = req.query; // or req.params if your route uses params
    const updates = req.body;

    // Security: Authenticated Vendor Check
    // Route is protected by vendorAuth middleware
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    const food = await Food.findById(id);
    if (!food) {
      return res.status(404).json({ success: false, message: "Food not found" });
    }

    // Security Check: Ensure food belongs to the authenticated vendor
    if (food.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. You do not own this food item."
      });
    }

    // ✅ Safely update top-level fields
    if (updates.name) food.name = updates.name;
    if (updates.description) food.description = updates.description;

    // ✅ Update categories (Requires strict validation)
    if (updates.categories) {
      if (Array.isArray(updates.categories) && updates.categories.length > 0) {
        food.categories = updates.categories;
      } else {
        return res.status(400).json({ success: false, message: "Categories must be a non-empty array" });
      }
    }

    if (updates.price) food.price = Number(updates.price);
    if (updates.deliveryFee !== undefined) food.deliveryFee = updates.deliveryFee;
    if (updates.estimatedDeliveryTime) food.estimatedDeliveryTime = updates.estimatedDeliveryTime;

    if (Array.isArray(updates.tags)) food.tags = updates.tags;

    if (updates.available !== undefined) food.available = updates.available;
    if (updates.stock !== undefined) food.stock = updates.stock;
    if (updates.packagingFee !== undefined) food.packagingFee = updates.packagingFee;
    if (updates.prepTime !== undefined) food.prepTime = updates.prepTime;
    if (updates.foodType !== undefined) food.foodType = updates.foodType;
    if (updates.allowInstructions !== undefined) food.allowInstructions = updates.allowInstructions;

    if (updates.nutrition && typeof updates.nutrition === "object") {
      food.nutrition = { ...food.nutrition, ...updates.nutrition };
    }

    if (updates.discount && typeof updates.discount === "object") {
      food.discount = { ...food.discount, ...updates.discount };
    }

    if (updates.availabilitySchedule && typeof updates.availabilitySchedule === "object") {
      food.availabilitySchedule = { ...food.availabilitySchedule, ...updates.availabilitySchedule };
    }

    // ✅ Update Portions (with validation)
    if (updates.portions) {
      if (!Array.isArray(updates.portions)) {
        return res.status(400).json({ success: false, message: "Portions must be an array" });
      }
      // Basic validation: ensure portionNumber and price exist
      const invalidPortion = updates.portions.find(p => !p.portionNumber || !p.price);
      if (invalidPortion) {
        return res.status(400).json({ success: false, message: "Each portion must have a portionNumber and price" });
      }
      food.portions = updates.portions;
    }

    // ✅ Update Choice Groups (Add-ons/Extras)
    if (updates.choiceGroups) {
      if (!Array.isArray(updates.choiceGroups)) {
        return res.status(400).json({ success: false, message: "Choice Groups must be an array" });
      }
      food.choiceGroups = updates.choiceGroups;
    }

    // ✅ Merge metadata instead of overwriting it
    if (updates.metadata && typeof updates.metadata === "object") {
      food.metadata = { ...food.metadata, ...updates.metadata };
    }

    // ✅ Replace images and variants only if valid arrays are passed
    if (Array.isArray(updates.images)) {
      food.images = updates.images;
    }

    if (Array.isArray(updates.variants)) {
      food.variants = updates.variants;
    }

    // ✅ Save the updated food
    await food.save();

    res.status(200).json({
      success: true,
      message: "Food updated successfully",
      data: food,
    });
  } catch (error) {
    console.error("❌ Error updating food:", error);
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: error.message,
    });
  }
};

// DELETE FOOD OR NESTED ITEM
export const deleteFood = async (req, res) => {
  try {
    const { id } = req.query; // Food ID
    const { variantId, imageId, tagKey, metaKey, deleteAll } = req.body;
    // 👆 flexible payload (decides what to delete)

    // Security: Authenticated Vendor Check
    // Route is protected by vendorAuth middleware
    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required."
      });
    }

    // Fetch food
    const food = await Food.findById(id);
    if (!food) {
      return res.status(404).json({ success: false, message: "Food not found" });
    }

    // Security Check: Ensure food belongs to the authenticated vendor
    if (food.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. You do not own this food item."
      });
    }

    // ✅ 1. Delete the entire food
    if (deleteAll) {
      await Food.findByIdAndDelete(id);

      // Remove reference from vendor
      await vendorModel.updateOne(
        { _id: food.vendor },
        { $pull: { foods: food._id } }
      );

      return res.status(200).json({
        success: true,
        message: "Food deleted successfully",
      });
    }

    // ✅ 2. Delete a specific variant
    if (variantId) {
      food.variants = food.variants.filter(v => v._id.toString() !== variantId);
    }

    // ✅ 3. Delete a specific image
    if (imageId) {
      food.images = food.images.filter(img => img._id.toString() !== imageId);
    }

    // ✅ 4. Delete a specific tag (by value)
    if (tagKey) {
      food.tags = food.tags.filter(tag => tag !== tagKey);
    }

    // ✅ 5. Delete a specific metadata key
    if (metaKey) {
      delete food.metadata[metaKey];
    }

    // ✅ 6. Save changes
    await food.save();

    res.status(200).json({
      success: true,
      message: "Selected item deleted successfully",
      data: food,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting food",
      error: error.message,
    });
  }
};