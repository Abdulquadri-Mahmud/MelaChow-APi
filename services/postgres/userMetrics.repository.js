import prisma from "../../config/prisma.js";

export const userMetricsRepository = {
  async getUserMetrics() {
    const days = 7;
    const result = [];
    const dateNow = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const startOfDay = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate() - i);
      const endOfDay = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate() - i + 1);

      const signupCount = await prisma.user.count({
        where: {
          createdAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      });

      const dayName = startOfDay.toLocaleDateString("en-US", { weekday: "short" });

      result.push({
        name: dayName,
        signups: signupCount,
      });
    }

    return { success: true, signupTrend: result };
  },
};
