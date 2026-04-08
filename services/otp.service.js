// import axios from 'axios'; // Removed Termii dependency
import { safeRedisSet, safeRedisGet } from '../config/redis.js';
import { sendMail } from '../config/mailer.js';
import User from '../model/user.model.js';
import logger from '../config/logger.js';

const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_REDIS_PREFIX = 'delivery_otp:';

/**
 * Send delivery confirmation OTP to customer.
 * Primary: Nodemailer email
 * Dev: Store fixed OTP 123456 in Redis, no external call
 *
 * @param {string} orderId - MongoDB Order _id
 * @param {string} customerPhone - Phone number from order (Param retained for backward compatibility)
 * @param {string} customerUserId - Order userId for email delivery
 * @returns {{ success: boolean, method: 'email'|'dev', pinId?: string }}
 */
export const sendDeliveryOTP = async (orderId, customerPhone, customerUserId) => {
    const redisKey = `${OTP_REDIS_PREFIX}${orderId}`;

    // Development bypass
    if (process.env.NODE_ENV !== 'production' || process.env.BYPASS_OTP === 'true') {
        await safeRedisSet(redisKey, JSON.stringify({
            method: 'dev',
            pinId: null,
            otp: '123456',
        }), { EX: OTP_TTL_SECONDS });

        logger.info({ orderId }, 'Dev mode: OTP bypass active - use 123456');
        return { success: true, method: 'dev' };
    }

    // Primary: Nodemailer email
    try {
        const user = await User.findById(customerUserId).select('email firstname');
        if (!user?.email) throw new Error('Customer email not found');

        // Generate a local 6-digit OTP for email delivery
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await safeRedisSet(redisKey, JSON.stringify({
            method: 'email',
            pinId: null,
            otp,
        }), { EX: OTP_TTL_SECONDS });

        await sendMail({
            to: user.email,
            subject: 'MelaChow Delivery Confirmation Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #f97316;">MelaChow Delivery Confirmation</h2>
                    <p>Hi ${user.firstname || 'there'},</p>
                    <p>Your rider is at your location. Please provide them with this code to confirm delivery:</p>
                    <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827;">${otp}</span>
                    </div>
                    <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. Do not share it with anyone other than your rider.</p>
                </div>
            `,
        });

        logger.info({ orderId, email: user.email }, 'Delivery OTP sent via email');
        return { success: true, method: 'email' };

    } catch (emailErr) {
        logger.error({ orderId, error: emailErr.message }, 'Email OTP delivery failed');
        throw new Error('Failed to send delivery OTP via email. Please try again.');
    }
};

/**
 * Verify delivery OTP submitted by rider.
 * Handles locally-stored OTP (email/dev).
 *
 * @param {string} orderId - MongoDB Order _id
 * @param {string} otp - 6-digit code entered by rider
 * @returns {{ verified: boolean }}
 */
export const verifyDeliveryOTP = async (orderId, otp) => {
    const redisKey = `${OTP_REDIS_PREFIX}${orderId}`;

    const stored = await safeRedisGet(redisKey);
    if (!stored) {
        throw new Error('OTP expired or not found. Please request a new code.');
    }

    let otpData;
    try {
        otpData = JSON.parse(stored);
    } catch {
        throw new Error('Invalid OTP session data. Please request a new code.');
    }

    const { method, pinId, otp: storedOtp } = otpData;

    // â”€â”€ Dev bypass â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (method === 'dev') {
        const verified = otp === '123456';
        if (verified) {
            await safeRedisSet(redisKey, JSON.stringify({ ...otpData, verified: true }), { EX: 60 });
        }
        return { verified };
    }

    // â”€â”€ Email/local OTP verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (method === 'email' && storedOtp) {
        const verified = otp === storedOtp;
        if (verified) {
            await safeRedisSet(redisKey, JSON.stringify({ ...otpData, verified: true }), { EX: 60 });
            logger.info({ orderId }, 'Delivery OTP verified via email');
        }
        return { verified };
    }

    // Backwards compatibility handler for any lingering Termii OTPs in-flight right now
    if (method === 'sms') {
        throw new Error('SMS verification is no longer supported. Please ask the rider to click "Resend Code" to receive a new OTP via Email.');
    }

    throw new Error('Invalid OTP session state. Please request a new code.');
};

