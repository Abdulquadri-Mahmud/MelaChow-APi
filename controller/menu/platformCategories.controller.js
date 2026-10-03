import Category from '../../model/category.model.js';
import { usePostgresReads, usePostgresMenuReads, toMongoCategoryShape } from '../../services/postgres/compat.js';
import { locationCategoryRepository } from '../../services/postgres/locationCategory.repository.js';

export const getPlatformCategories = async (_req, res) => {
    try {
        const categories = usePostgresReads() || usePostgresMenuReads()
            ? (await locationCategoryRepository.listCategoriesWithParent()).map(toMongoCategoryShape)
            : await Category.find({ isActive: true }).populate('parent', 'name slug').sort('name').lean();
        return res.status(200).json({ success: true, categories });
    } catch (error) {
        console.error('[Menu categories]', error.message);
        return res.status(500).json({ success: false, message: 'Categories could not be loaded. Please try again.' });
    }
};
