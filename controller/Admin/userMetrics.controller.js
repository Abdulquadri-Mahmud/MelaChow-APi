// controller/Admin/userMetrics.controller.js
import User from "../../model/user.model.js";
import { usePostgresUserMetricsReads } from "../../services/postgres/compat.js";
import { userMetricsRepository } from "../../services/postgres/userMetrics.repository.js";

/**
 * Get User Analytics (Signup Trends)
 */
export const getUserMetrics = async (req, res) => {
    try {
        if (usePostgresUserMetricsReads()) {
            const response = await userMetricsRepository.getUserMetrics();
            return res.status(200).json(response);
        }

        const days = 7;
        const result = [];
        const dateNow = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const startOfDay = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate() - i);
            const endOfDay = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate() - i + 1);

            const signupCount = await User.countDocuments({
                createdAt: { $gte: startOfDay, $lt: endOfDay }
            });

            const dayName = startOfDay.toLocaleDateString("en-US", { weekday: "short" });
            
            result.push({
                name: dayName,
                signups: signupCount
            });
        }
        
        res.status(200).json({ success: true, signupTrend: result });
    } catch (err) {
        console.error("User Analytics Error: ", err);
        res.status(500).json({ success: false, message: "Error fetching user metrics", error: err.message });
    }
};
