import { sendMail } from '../../../config/mailer.js';
import { wrapLayout } from '../../../services/emailTemplate.service.js';

export const sendVendorSuspensionEmail = async (vendor, reason) => {
  const subject = "Your Vendor Account Has Been Suspended";
  const html = wrapLayout(
    'Account Suspended',
    `
    <p class="p">Urgent Notice: ${vendor.name || 'Partner'},</p>
    <p class="p">We are writing to inform you that your vendor account has been <b>temporarily suspended</b> from the MelaChow platform.</p>
    <div style="background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px; margin: 24px 0;">
      <p class="p" style="margin: 0; font-weight: 700; color: #92400E;">Reason for Suspension:</p>
      <p class="p" style="margin: 4px 0 0; color: #B45309; font-size: 14px;">${reason || "Policy violations detected by our automated auditing system."}</p>
    </div>
    <p class="p">While suspended, your storefront will be invisible to customers and you will be unable to process orders. This action is taken to protect the integrity of our marketplace.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="mailto:support@melachow.com" class="button" style="background-color: #111827; margin-right: 8px;">Email Support</a>
      <a href="mailto:help@melachow.com" class="button" style="background-color: #4B5563;">Email Help Desk</a>
    </div>
    <p class="p" style="font-size: 14px; color: #6B7280;">Please reference your merchant ID when contacting support for faster resolution.</p>
    `,
    'Action Required'
  );

  await sendMail({ to: vendor.email, subject, html });
};
