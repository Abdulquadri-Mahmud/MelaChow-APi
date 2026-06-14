import prisma from "../../config/prisma.js";

export const categoryMetricsRepository = {
  async getCategoryMetrics() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            menuItems: {
              where: {
                isArchived: false,
              },
            },
          },
        },
      },
    });

    const distribution = categories
      .map((category) => ({
        name: category.name,
        count: category._count.menuItems,
      }))
      .filter((category) => category.count > 0)
      .sort((left, right) => right.count - left.count);

    return {
      success: true,
      distribution,
    };
  },
};
