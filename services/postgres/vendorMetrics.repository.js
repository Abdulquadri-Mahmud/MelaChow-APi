import prisma from "../../config/prisma.js";

const paidMetricStatuses = ["paid"];

const sumOrders = (orders) => orders.reduce((acc, order) => acc + (order.total || 0), 0);

const ordersSince = (startDate) =>
  prisma.order.findMany({
    where: {
      createdAt: { gte: startDate },
      paymentStatus: { in: paidMetricStatuses },
    },
    select: {
      total: true,
    },
  });

const ordersInRange = (startDate, endDate) =>
  prisma.order.findMany({
    where: {
      createdAt: { gte: startDate, lt: endDate },
      paymentStatus: { in: paidMetricStatuses },
    },
    select: {
      total: true,
    },
  });

export const vendorMetricsRepository = {
  async getVendorMetrics() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfLast7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const startOfLast30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    const [dailyOrders, weeklyOrders, monthlyOrders, dailyVendors, weeklyVendors, monthlyVendors] = await Promise.all([
      ordersSince(startOfToday),
      ordersSince(startOfLast7Days),
      ordersSince(startOfLast30Days),
      prisma.vendor.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.vendor.count({ where: { createdAt: { gte: startOfLast7Days } } }),
      prisma.vendor.count({ where: { createdAt: { gte: startOfLast30Days } } }),
    ]);

    const trend7DaysSales = [];
    const trend7DaysVendors = [];
    const days = 7;

    for (let i = days - 1; i >= 0; i--) {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      const dayName = startOfDay.toLocaleDateString("en-US", { weekday: "short" });

      const [dayOrders, dayVendorsCount] = await Promise.all([
        ordersInRange(startOfDay, endOfDay),
        prisma.vendor.count({
          where: {
            createdAt: { gte: startOfDay, lt: endOfDay },
          },
        }),
      ]);

      trend7DaysSales.push({
        name: dayName,
        count: dayOrders.length,
        revenue: sumOrders(dayOrders),
      });

      trend7DaysVendors.push({
        name: dayName,
        count: dayVendorsCount,
      });
    }

    return {
      success: true,
      data: {
        sales: {
          daily: { count: dailyOrders.length, revenue: sumOrders(dailyOrders) },
          weekly: { count: weeklyOrders.length, revenue: sumOrders(weeklyOrders) },
          monthly: { count: monthlyOrders.length, revenue: sumOrders(monthlyOrders) },
          trend7Days: trend7DaysSales,
        },
        registrations: {
          daily: dailyVendors,
          weekly: weeklyVendors,
          monthly: monthlyVendors,
          trend7Days: trend7DaysVendors,
        },
      },
    };
  },
};
