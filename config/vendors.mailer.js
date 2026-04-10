import { sendMail } from "./mailer.js";

/**
 * Sends styled MelaChow Vendor email for login, password reset, or resend OTP
 * @param {Object} vendor - Vendor object (must include email)
 * @param {string} otp - 6-digit OTP code
 * @param {"login" | "reset" | "resend"} type - Type of email to send
 */
export const sendVendorEmail = async (vendor, otp, type) => {
  const year = new Date().getFullYear();

  let subject = "";
  let headerText = "";
  let subHeaderText = "";
  let bodyText = "";

  // ✅ Customize email based on type
  switch (type) {
    case "login":
      subject = "Your MelaChow Vendor Login OTP";
      headerText = "Login Verification OTP";
      subHeaderText = "Manage your store ðŸ´";
      bodyText = `
        <p>Use the OTP below to log in to your <strong>MelaChow Vendor</strong> account.<br/>
        This code expires in <strong>10 minutes</strong>:</p>
      `;
      break;

    case "reset":
      subject = "Reset your MelaChow Vendor password";
      headerText = "Password Reset OTP";
      subHeaderText = "Reset your password ðŸ”";
      bodyText = `
        <p>We received a request to reset your <strong>MelaChow Vendor</strong> password.<br/>
        Use the OTP below to continue. It expires in <strong>10 minutes</strong>:</p>
      `;
      break;

    case "resend":
      subject = "Your new MelaChow Vendor OTP";
      headerText = "New Verification OTP";
      subHeaderText = "Your new login code ðŸ”";
      bodyText = `
        <p>Hereâ€™s your new OTP to log in to your <strong>MelaChow Vendor</strong> account.<br/>
        It expires in <strong>10 minutes</strong>:</p>
      `;
      break;

    default:
      throw new Error("Invalid email type provided");
  }

  // ✅ Main email template
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9f9f9; padding: 30px;">
      <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="background-color: #FF6600; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">MelaChow Vendor</h1>
          <p style="color: #ffe6d1; margin: 5px 0 0;">${subHeaderText}</p>
        </div>

        <div style="padding: 30px; color: #333;">
          <h2 style="color: #FF6600;">${headerText}</h2>
          ${bodyText}

          <div style="text-align: center; margin: 30px 0;">
            <p style="font-size: 26px; font-weight: bold; letter-spacing: 4px; color: #FF6600;">${otp}</p>
          </div>

          <p>If you didn't request this, please ignore this email.</p>
          <p>— <strong>The MelaChow Team</strong></p>
        </div>

        <div style="background-color: #fafafa; text-align: center; padding: 15px; font-size: 12px; color: #777;">
          <p>© ${year} MelaChow. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  // ✅ Send the email
  await sendMail({
    to: vendor.email,
    subject,
    html,
  });
};

