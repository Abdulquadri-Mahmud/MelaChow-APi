import "../config/env.js";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";

const email = String(process.env.LOCAL_SUPERADMIN_EMAIL || "superadmin@local.melachow.test")
  .trim()
  .toLowerCase();
const plainPassword = process.env.LOCAL_SUPERADMIN_PASSWORD || "Test1234!";
const password = await bcrypt.hash(plainPassword, 12);

try {
  await prisma.admin.upsert({
    where: { email },
    update: {
      name: "Local Superadmin",
      password,
      role: "super_admin",
      isActive: true,
      loginAttempts: 0,
      lockUntil: null,
    },
    create: {
      name: "Local Superadmin",
      email,
      password,
      role: "super_admin",
      isActive: true,
    },
  });

  console.log(`Seeded local superadmin: ${email}`);
} finally {
  await prisma.$disconnect();
}
