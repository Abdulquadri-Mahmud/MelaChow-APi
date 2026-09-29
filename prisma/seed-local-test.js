import "../config/env.js";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";

const password = await bcrypt.hash("Test1234!", 12);
const state = await prisma.state.findUniqueOrThrow({ where: { name: "Lagos" } });
const city = await prisma.city.findUniqueOrThrow({
  where: { name_stateId: { name: "Lekki", stateId: state.id } },
});

await prisma.user.upsert({
  where: { email: "customer@local.melachow.test" },
  update: { password, isVerified: true, isActive: true },
  create: {
    firstname: "Local",
    lastname: "Customer",
    fullName: "Local Customer",
    email: "customer@local.melachow.test",
    phone: "08000000001",
    password,
    isVerified: true,
    addresses: {
      create: {
        label: "Home",
        addressLine: "1 Admiralty Way, Lekki",
        cityId: city.id,
        stateId: state.id,
        cityName: city.name,
        stateName: state.name,
        cityText: city.name,
        stateText: state.name,
        latitude: 6.4474,
        longitude: 3.4723,
        isDefault: true,
      },
    },
  },
});

await prisma.admin.upsert({
  where: { email: "admin@local.melachow.test" },
  update: { password },
  create: { name: "Local Admin", email: "admin@local.melachow.test", password, role: "super_admin" },
});

let vendor = await prisma.vendor.findFirst({ where: { email: "vendor@local.melachow.test" } });
const vendorData = {
  name: "Local Kitchen Owner",
  email: "vendor@local.melachow.test",
  phone: "08000000002",
  password,
  storeName: "Lekki Test Kitchen",
  storeSlug: "lekki-test-kitchen",
  storeDescription: "Local PostgreSQL test restaurant",
  address: { street: "10 Admiralty Way", city: city.name, state: state.name },
  stateId: state.id,
  cityId: city.id,
  locationStatus: "approved",
  cuisineTypes: ["Nigerian"],
  verified: true,
  isApproved: true,
  active: true,
  isLive: true,
  publishedAt: new Date(),
  pickupLatitude: 6.4474,
  pickupLongitude: 3.4723,
  pickupFormattedAddress: "10 Admiralty Way, Lekki, Lagos",
  pickupLocationVerifiedAt: new Date(),
};
vendor = vendor
  ? await prisma.vendor.update({ where: { id: vendor.id }, data: vendorData })
  : await prisma.vendor.create({ data: vendorData });

let rider = await prisma.rider.findFirst({ where: { phone: "08000000003" } });
const riderData = {
  name: "Local Rider",
  phone: "08000000003",
  email: "rider@local.melachow.test",
  password,
  stateId: state.id,
  cityId: city.id,
  locationStatus: "approved",
  serviceZones: [city.id],
  managedBy: "admin",
  status: "available",
  isActive: true,
  isVerified: true,
  approvedAt: new Date(),
};
rider = rider
  ? await prisma.rider.update({ where: { id: rider.id }, data: riderData })
  : await prisma.rider.create({ data: riderData });

const category = await prisma.category.findFirstOrThrow({ where: { parentId: { not: null }, isActive: true } });
const section = await prisma.vendorMenuSection.upsert({
  where: { id: "00000000-0000-4000-8000-000000000101" },
  update: { vendorId: vendor.id, name: "Popular meals", isVisible: true },
  create: { id: "00000000-0000-4000-8000-000000000101", vendorId: vendor.id, name: "Popular meals" },
});

for (const [index, item] of [
  ["Jollof Rice & Chicken", 450000],
  ["Egusi Soup & Pounded Yam", 520000],
  ["Grilled Chicken Shawarma", 380000],
].entries()) {
  const id = `00000000-0000-4000-8000-${String(index + 201).padStart(12, "0")}`;
  await prisma.menuItem.upsert({
    where: { id },
    update: { name: item[0], vendorId: vendor.id, platformCategoryId: category.id, isAvailable: true, isInStock: true },
    create: {
      id,
      vendorId: vendor.id,
      platformCategoryId: category.id,
      vendorSectionId: section.id,
      name: item[0],
      description: "Local PostgreSQL test menu item",
      isAvailable: true,
      isInStock: true,
      portions: { create: { label: "Regular", price: item[1], isDefault: true } },
    },
  });
}

console.log("Local PostgreSQL test fixtures completed.");
await prisma.$disconnect();
