// controller/Admin/locationMetrics.controller.js
import Vendor from "../../model/vendor/Vendor.js";
import City from "../../model/location/City.js";

/**
 * Get Location Analytics (Vendor Density)
 */
export const getLocationMetrics = async (req, res) => {
    try {
        const topCities = await Vendor.aggregate([
            { $match: { is_verified: true, is_blocked: false } },
            { $group: { _id: "$city", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 }
        ]);

        // Populating city names
        const result = [];
        for (const entry of topCities) {
            if (!entry._id) continue;
            const city = await City.findById(entry._id);
            if (city) {
                result.push({
                    name: city.name,
                    count: entry.count
                });
            }
        }

        res.status(200).json({ success: true, top_cities: result });
    } catch (err) {
        console.error("Location Analytics Error: ", err);
        res.status(500).json({ success: false, message: "Error fetching location metrics", error: err.message });
    }
};
