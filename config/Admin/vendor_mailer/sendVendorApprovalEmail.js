import { sendMail } from '../../../config/mailer.js';
import { wrapLayout } from '../../../services/emailTemplate.service.js';

export const sendVendorApprovalEmail = async (vendor) => {
  const subject = "Your Vendor Account Has Been Approved";

  const html = wrapLayout(
    'Account Approved',
    `
    <p class="p">Congratulations, ${vendor.name || 'Vendor'}!</p>
    <p class="p">Your storefront has been successfully verified and approved by our quality control team. You are now officially a part of the MelaChow merchant network.</p>
    <p class="p">You can now stock your kitchen, set your opening hours, and start receiving orders from thousands of customers.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://melachow.com/vendor/login" class="button">Open My Store</a>
    </div>
    <p class="p" style="font-size: 14px; color: #6B7280;">Need help setting up your menu? Check out our Merchant Guide in the portal sidebar.</p>
    `,
    'Onboarding Complete'
  );

  await sendMail({ to: vendor.email, subject, html });
};

