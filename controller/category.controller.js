import Category from "../model/category.model.js";

// GET PUBLIC CATEGORIES (User Home Page - Root Only)
export const getPublicCategories = async (req, res) => {
    try {
        const categories = await Category.find({
            parent: null,
            isActive: true
        })
            .select("_id name slug image")
            .sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            data: categories,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching public categories",
        });
    }
};

// GET ALL CATEGORIES (Hierarchical structure - Generic active)
export const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true }).populate("parent", "name");

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching categories",
            error: error.message,
        });
    }
};

// CREATE CATEGORY
export const createCategory = async (req, res) => {
    try {
        const { name, parent, parentName, description, image, slug } = req.body;

        let parentId = parent || null;

        // Resolve parentName if provided (Overwrites 'parent' if both exist, or used if 'parent' is missing)
        if (parentName) {
            const parentCategory = await Category.findOne({
                $or: [{ name: parentName }, { slug: parentName }],
            });

            if (!parentCategory) {
                return res.status(400).json({
                    success: false,
                    message: `Parent category '${parentName}' not found`,
                });
            }
            parentId = parentCategory._id;
        }

        const category = await Category.create({
            name,
            slug,
            parent: parentId,
            description,
            image,
        });

        res.status(201).json({
            success: true,
            data: category,
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `The ${field} '${error.keyValue[field]}' is already in use.`,
            });
        }

        res.status(500).json({
            success: false,
            message: "Error creating category",
            error: error.message,
        });
    }
};


// UPDATE CATEGORY
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, parent, parentName, description, image, slug, isActive } = req.body;

        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        // Resolve parentName if provided
        if (parentName) {
            const parentCategory = await Category.findOne({
                $or: [{ name: parentName }, { slug: parentName }],
            });

            if (!parentCategory) {
                return res.status(400).json({
                    success: false,
                    message: `Parent category '${parentName}' not found`,
                });
            }
            category.parent = parentCategory._id;
        } else if (parent !== undefined) {
            // Backward compatibility: allow direct ID update or clearing (null)
            category.parent = parent || null;
        }

        // Update other fields if provided
        if (name !== undefined) category.name = name;
        if (description !== undefined) category.description = description;
        if (image !== undefined) category.image = image;
        if (isActive !== undefined) category.isActive = isActive;
        if (slug !== undefined) category.slug = slug; // Empty string triggers generation in hook

        // Save triggers validators and pre-save hooks
        await category.save();

        res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: category,
        });
    } catch (error) {
        // Handle duplicate key error
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `The ${field} '${error.keyValue[field]}' is already in use.`,
            });
        }

        res.status(500).json({
            success: false,
            message: "Error updating category",
            error: error.message,
        });
    }
};

// DELETE CATEGORY (Soft Delete)
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findByIdAndUpdate(
            id,
            { isActive: false },
            { new: true }
        );

        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.status(200).json({
            success: true,
            message: "Category deleted successfully",
            data: category,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting category",
            error: error.message,
        });
    }
};

// GET ALL CATEGORIES (Including inactive for admin)
export const getAllCategoriesAdmin = async (req, res) => {
    try {
        const categories = await Category.find().populate("parent", "name").sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching categories",
            error: error.message,
        });
    }
};
