// config/Vendor/vendorAccountCreated.mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { wrapLayout } from "../services/emailTemplate.service.js";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail", // or any preferred service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendVendorAccountCreatedEmail = async (vendor) => {
  const subject = "Welcome to MelaChow, Your Vendor Account Has Been Created!";

  const html = wrapLayout(
    'Welcome to the Family',
    `
    <p class="p">Hi ${vendor.name || 'Vendor'},</p>
    <p class="p">We're thrilled to have you join MelaChow! Your vendor account has been successfully created. Our team is now reviewing your information to ensure everything is ready for your debut.</p>
    <p class="p">Once verified, your store will go live and you'll be able to manage orders, update your menu, and track your earnings in real-time.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://melachow.com/vendor/login" class="button">Access Merchant Portal</a>
    </div>
    <p class="p" style="font-size: 14px; color: #6B7280;">We'll send you another update as soon as your account is activated. Usually this takes less than 24 hours.</p>
    `,
    'Portal Access'
  );

  await transporter.sendMail({
    from: `"MelaChow Vendor Team" <${process.env.EMAIL_USER}>`,
    to: vendor.email,
    subject,
    html,
  });
};

