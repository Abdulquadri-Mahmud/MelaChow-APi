import { sendMail } from '../../../config/mailer.js';

export const sendVendorReactivationEmail = async (vendor) => {
  const subject = "Your Vendor Account Has Been Reactivated";
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f9f9f9; padding: 30px;">
      <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.8);">
        <div style="background-color: #ff6600; color: #ffffff; padding: 20px 30px;">
          <h2 style="margin: 0; font-size: 22px;">Account Reactivated</h2>
          <p style="color: #ffe6d1; margin: 5px 0;">Manage your store 🍴</p>
          </div>
        <div style="padding: 30px; color: #333333;">
          <p>Dear <b>${vendor.storeName}</b>,</p>
          <p>Good news! Your vendor account has been <b>reactivated</b> and you can now resume your business operations on <b>ChowConnect</b>.</p>
          <p>We're glad to have you back. Please ensure your future activities comply with our vendor policy guidelines to avoid future suspensions.</p>
          <div style="margin-top: 20px; text-align: center;">
            <a href="https://auroragems.com/vendor/login"
              style="display: inline-block; background-color: #FF6600; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Proceed to login
            </a>
          </div>
          <p style="margin-top: 30px;">Need help or have questions? Contact our support team anytime.</p>
          <p>— <b>The ChowConnect Team</b></p>
        </div>
        <div style="background-color: #f1f1f1; text-align: center; padding: 15px; font-size: 13px; color: #666;">
          <p>© ${new Date().getFullYear()} ChowConnect. All rights reserved.</p>
        </div>
      </div>
    </div>
    `;

  await sendMail({ to: vendor.email, subject, html });
};
