// controller/Admin/dashboard.controller.js
import Order from "../../model/order/Order.js";
import Vendor from "../../model/vendor/vendor.model.js";

/**
 * Get 7-Day Operational Velocity (System Volume & Partner Onboarding)
 */
export const getOperationalVelocity = async (req, res) => {
    try {
        const days = 7;
        const result = [];
        const dateNow = new Date();
        
        // Loop backwards from 6 days ago -> today. (7 days total)
        for (let i = days - 1; i >= 0; i--) {
            const startOfDay = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate() - i);
            const endOfDay = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate() - i + 1);

            const ordersQuery = await Order.countDocuments({
                createdAt: { $gte: startOfDay, $lt: endOfDay }
            });
            
            const vendorsQuery = await Vendor.countDocuments({
                createdAt: { $gte: startOfDay, $lt: endOfDay }
            });

            // Use the shortened day of the week ('Mon', 'Tue' etc )
            const dayName = startOfDay.toLocaleDateString("en-US", { weekday: "short" });
            
            result.push({
                name: dayName,
                volume: ordersQuery,
                onboarding: vendorsQuery
            });
        }
        
        res.status(200).json({ success: true, operationalData: result });
    } catch (err) {
        console.error("Dashboard Analytics Error: ", err);
        res.status(500).json({ success: false, message: "Error fetching operational velocity", error: err.message });
    }
};
