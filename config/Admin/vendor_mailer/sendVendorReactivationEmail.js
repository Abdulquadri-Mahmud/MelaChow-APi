import { sendMail } from '../../../config/mailer.js';
import { wrapLayout } from '../../../services/emailTemplate.service.js';

export const sendVendorReactivationEmail = async (vendor) => {
  const subject = "Your Vendor Account Has Been Reactivated";
  const html = wrapLayout(
    'Account Reactivated',
    `
    <p class="p">Welcome back, ${vendor.storeName || 'Partner'}!</p>
    <p class="p">Your vendor account has been <b>reactivated</b> and you can now resume your business operations on MelaChow immediately.</p>
    <p class="p">We're glad to have you back. Please ensure your future activities comply with our merchant guidelines to maintain a high-quality experience for all users.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://melachow.com/vendor/login" class="button">Resume Operations</a>
    </div>
    <p class="p" style="font-size: 14px; color: #6B7280;">If you have any questions regarding your previous suspension, our merchant support team is available 24/7.</p>
    `,
    'Status Restored'
  );

  await sendMail({ to: vendor.email, subject, html });
};
