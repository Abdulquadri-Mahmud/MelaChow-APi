import Order from "../../model/order/Order.js";
import Vendor from "../../model/vendor/vendor.model.js";
import { usePostgresVendorMetricsReads } from "../../services/postgres/compat.js";
import { vendorMetricsRepository } from "../../services/postgres/vendorMetrics.repository.js";

/**
 * Get Comprehensive Vendor Metrics (System Wide)
 * Includes Sales volume/amount and Vendor Registrations
 */
export const getVendorMetrics = async (req, res) => {
    try {
        if (usePostgresVendorMetricsReads()) {
            const response = await vendorMetricsRepository.getVendorMetrics();
            return res.status(200).json(response);
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfLast7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        const startOfLast30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

        // Utility function to sum array of orders
        const sumOrders = (orders) => orders.reduce((acc, order) => acc + (order.total || 0), 0);

        // Fetch Date Ranges - Orders
        const [dailyOrders, weeklyOrders, monthlyOrders] = await Promise.all([
            Order.find({ createdAt: { $gte: startOfToday }, paymentStatus: { $in: ["paid", "delivered", "completed"] } }),
            Order.find({ createdAt: { $gte: startOfLast7Days }, paymentStatus: { $in: ["paid", "delivered", "completed"] } }),
            Order.find({ createdAt: { $gte: startOfLast30Days }, paymentStatus: { $in: ["paid", "delivered", "completed"] } }),
        ]);

        // Fetch Date Ranges - Vendors
        const [dailyVendors, weeklyVendors, monthlyVendors] = await Promise.all([
            Vendor.countDocuments({ createdAt: { $gte: startOfToday } }),
            Vendor.countDocuments({ createdAt: { $gte: startOfLast7Days } }),
            Vendor.countDocuments({ createdAt: { $gte: startOfLast30Days } }),
        ]);

        // Build 7-Day Trend Arrays
        const trend7DaysSales = [];
        const trend7DaysVendors = [];
        const days = 7;

        for (let i = days - 1; i >= 0; i--) {
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
            const dayName = startOfDay.toLocaleDateString("en-US", { weekday: "short" });

            const dayOrders = await Order.find({
                createdAt: { $gte: startOfDay, $lt: endOfDay },
                paymentStatus: { $in: ["paid", "delivered", "completed"] }
            });
            const dayVendorsCount = await Vendor.countDocuments({
                createdAt: { $gte: startOfDay, $lt: endOfDay }
            });

            trend7DaysSales.push({
                name: dayName,
                count: dayOrders.length,
                revenue: sumOrders(dayOrders)
            });

            trend7DaysVendors.push({
                name: dayName,
                count: dayVendorsCount
            });
        }

        res.status(200).json({
            success: true,
            data: {
                sales: {
                    daily: { count: dailyOrders.length, revenue: sumOrders(dailyOrders) },
                    weekly: { count: weeklyOrders.length, revenue: sumOrders(weeklyOrders) },
                    monthly: { count: monthlyOrders.length, revenue: sumOrders(monthlyOrders) },
                    trend7Days: trend7DaysSales
                },
                registrations: {
                    daily: dailyVendors,
                    weekly: weeklyVendors,
                    monthly: monthlyVendors,
                    trend7Days: trend7DaysVendors
                }
            }
        });

    } catch (err) {
        console.error("Vendor Metrics Fetch Error: ", err);
        res.status(500).json({ success: false, message: "Error fetching vendor metrics", error: err.message });
    }
};
