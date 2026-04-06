import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail", // You can switch to SendGrid, Mailgun, etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// =============================
// ADMIN-SPECIFIC EMAIL HANDLER
// =============================
export const sendAdminEmail = async (admin, otp, type) => {
  let subject, html;

  switch (type) {
    case "reset":
      subject = "Reset Your MelaChow Admin Password";
      html = `
        <div style="font-family: 'Segoe UI', sans-serif; background-color: #f7f7f7; padding: 30px;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            <div style="background-color: #ff6600; padding: 20px; text-align: center;">
              <h1 style="color: #fff; margin: 0;">MelaChow Admin</h1>
              <p style="color: #ffe6d1; margin: 5px 0;">Password Reset</p>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #ff6600;">Password Reset Request</h2>
              <p>We received a request to reset your admin password. Use the OTP below to proceed:</p>
              <div style="text-align: center; margin: 25px 0;">
                <p style="font-size: 28px; font-weight: bold; color: #ff6600; letter-spacing: 5px;">${otp}</p>
              </div>
              <p>This OTP expires in <b>10 minutes</b>.</p>
              <p>If you didnâ€™t request this, you can safely ignore this email.</p>
              <p>â€” <strong>The MelaChow Team</strong></p>
            </div>
          </div>
        </div>`;
      break;

    case "login":
      subject = "Your MelaChow Admin Login OTP";
      html = `
        <div style="font-family: 'Segoe UI', sans-serif; background-color: #f7f7f7; padding: 30px;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            <div style="background-color: #ff6600; padding: 20px; text-align: center;">
              <h1 style="color: #fff; margin: 0;">MelaChow Admin</h1>
              <p style="color: #ffe6d1; margin: 5px 0;">Secure Login</p>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #ff6600;">Login Verification OTP</h2>
              <p>Use the OTP below to complete your login. This code will expire in <b>10 minutes</b>:</p>
              <div style="text-align: center; margin: 25px 0;">
                <p style="font-size: 28px; font-weight: bold; color: #ff6600; letter-spacing: 5px;">${otp}</p>
              </div>
              <p>If you didnâ€™t request this, you can ignore this email.</p>
              <p>â€” <strong>The MelaChow Team</strong></p>
            </div>
          </div>
        </div>`;
      break;

    case "resend":
      subject = "Your New MelaChow Admin OTP";
      html = `
        <div style="font-family: 'Segoe UI', sans-serif; background-color: #f7f7f7; padding: 30px;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            <div style="background-color: #ff6600; padding: 20px; text-align: center;">
              <h1 style="color: #fff; margin: 0;">MelaChow Admin</h1>
              <p style="color: #ffe6d1; margin: 5px 0;">New OTP Issued</p>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #ff6600;">Resend OTP Request</h2>
              <p>Hereâ€™s your new one-time password. It expires in <b>10 minutes</b>:</p>
              <div style="text-align: center; margin: 25px 0;">
                <p style="font-size: 28px; font-weight: bold; color: #ff6600; letter-spacing: 5px;">${otp}</p>
              </div>
              <p>If you didnâ€™t request this, you can ignore this message.</p>
              <p>â€” <strong>The MelaChow Team</strong></p>
            </div>
          </div>
        </div>`;
      break;

    default:
      throw new Error("Invalid email type provided.");
  }

  await transporter.sendMail({
    from: `"MelaChow Admin" <${process.env.EMAIL_USER}>`,
    to: admin.email,
    subject,
    html,
  });
};

// =============================
// GENERIC EMAIL SENDER
// =============================
export const sendMail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"MelaChow" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

