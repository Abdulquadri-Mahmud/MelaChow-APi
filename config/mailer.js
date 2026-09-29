import { Resend } from 'resend';

let resend;

const getResendClient = () => {
    if (resend) return resend;

    if (!process.env.RESEND_API_KEY) {
        // Local development should not require production email credentials.
        // Callers can still complete their flow using a development OTP returned
        // by the relevant controller. Production must always have Resend set.
        if (process.env.NODE_ENV !== 'production') return null;
        throw new Error('RESEND_API_KEY environment variable is required');
    }

    resend = new Resend(process.env.RESEND_API_KEY);
    return resend;
};

/**
 * Send transactional email via Resend API.
 * Uses HTTPS (port 443) â€” works on Render free tier.
 * Drop-in replacement for nodemailer sendMail.
 *
 * @param {object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML email body
 */
export const sendMail = async ({ to, subject, html }) => {
    const client = getResendClient();
    if (!client) {
        console.info(`[Local email preview] to=${to} subject=${subject}`);
        return { id: 'local-message-id', to, subject, localPreview: true };
    }

    const { data, error } = await client.emails.send({
        from: 'MelaChow <hello@contact.melachow.com>',
        to,
        subject,
        html,
    });

    if (error) {
        throw new Error(`Email send failed: ${error.message}`);
    }

    return data;
};
