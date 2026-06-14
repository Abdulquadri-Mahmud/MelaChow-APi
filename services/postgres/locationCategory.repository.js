import prisma from "../../config/prisma.js";

export const locationCategoryRepository = {
  listActiveStates() {
    return prisma.state.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        cities: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
  },

  listActiveCitiesByState(stateId) {
    return prisma.city.findMany({
      where: {
        stateId,
        isActive: true,
      },
      orderBy: { name: "asc" },
      include: {
        state: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  getActiveStateById(stateId) {
    return prisma.state.findFirst({
      where: {
        id: stateId,
        isActive: true,
      },
    });
  },

  listActiveCategories() {
    return prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      include: {
        children: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
  },

  listRootPublicCategories() {
    return prisma.category.findMany({
      where: {
        parentId: null,
        isActive: true,
      },
      select: {
        id: true,
        legacyMongoId: true,
        name: true,
        slug: true,
        image: true,
        parentId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  },

  listCategoriesWithParent() {
    return prisma.category.findMany({
      where: { isActive: true },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  },

  listCategoryTree({ includeInactive = false } = {}) {
    return prisma.category.findMany({
      where: {
        parentId: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { createdAt: "asc" },
      include: {
        children: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
  },
};
