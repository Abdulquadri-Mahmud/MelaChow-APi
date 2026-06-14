import "../config/env.js";
import prisma from "../config/prisma.js";
import { DEFAULT_CATEGORIES } from "../config/categorySeed.js";

const STATES = [
  {
    name: "Lagos",
    cities: [
      { name: "Ikeja", platformDeliveryFee: 0 },
      { name: "Lekki", platformDeliveryFee: 0 },
      { name: "Victoria Island", platformDeliveryFee: 0 },
      { name: "Yaba", platformDeliveryFee: 0 },
    ],
  },
];

const normalizeSlug = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const seedLocations = async () => {
  for (const stateData of STATES) {
    const state = await prisma.state.upsert({
      where: { name: stateData.name },
      update: { isActive: true },
      create: { name: stateData.name },
    });

    for (const cityData of stateData.cities) {
      await prisma.city.upsert({
        where: {
          name_stateId: {
            name: cityData.name,
            stateId: state.id,
          },
        },
        update: {
          isActive: true,
          platformDeliveryFee: cityData.platformDeliveryFee,
        },
        create: {
          name: cityData.name,
          stateId: state.id,
          platformDeliveryFee: cityData.platformDeliveryFee,
        },
      });
    }
  }
};

const seedCategories = async () => {
  for (const categoryData of DEFAULT_CATEGORIES) {
    const rootSlug = normalizeSlug(categoryData.name);
    let root = await prisma.category.findFirst({
      where: {
        slug: rootSlug,
        parentId: null,
      },
    });

    if (root) {
      root = await prisma.category.update({
        where: { id: root.id },
        data: {
          name: categoryData.name,
          isActive: true,
        },
      });
    } else {
      root = await prisma.category.create({
        data: {
          name: categoryData.name,
          slug: rootSlug,
        },
      });
    }

    for (const subName of categoryData.subcategories) {
      const childSlug = normalizeSlug(subName);
      const existingChild = await prisma.category.findFirst({
        where: {
          slug: childSlug,
          parentId: root.id,
        },
      });

      if (existingChild) {
        await prisma.category.update({
          where: { id: existingChild.id },
          data: {
            name: subName,
            isActive: true,
          },
        });
      } else {
        await prisma.category.create({
          data: {
            name: subName,
            slug: childSlug,
            parentId: root.id,
          },
        });
      }
    }
  }
};

try {
  await seedLocations();
  await seedCategories();
  console.log("PostgreSQL seed completed.");
} finally {
  await prisma.$disconnect();
}
