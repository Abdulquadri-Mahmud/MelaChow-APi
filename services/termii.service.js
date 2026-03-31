import axios from 'axios';
import { safeRedisSet, safeRedisGet } from '../config/redis.js';
import { sendMail } from '../config/mailer.js';
import User from '../model/user.model.js';
import logger from '../config/logger.js';

const TERMII_API_URL = 'https://v3.api.termii.com/api';
const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_REDIS_PREFIX = 'delivery_otp:';

/**
 * Send delivery confirmation OTP to customer.
 * Primary: Termii SMS
 * Fallback: Nodemailer email
 * Dev: Store fixed OTP 123456 in Redis, no external call
 *
 * @param {string} orderId - MongoDB Order _id
 * @param {string} customerPhone - Phone number from order (e.g. "2348012345678")
 * @param {string} customerUserId - Order userId for email fallback
 * @returns {{ success: boolean, method: 'sms'|'email'|'dev', pinId?: string }}
 */
export const sendDeliveryOTP = async (orderId, customerPhone, customerUserId) => {
    const redisKey = `${OTP_REDIS_PREFIX}${orderId}`;

    // ── Development bypass ───────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'production' || process.env.BYPASS_OTP === 'true') {
        await safeRedisSet(redisKey, JSON.stringify({
            method: 'dev',
            pinId: null,
            otp: '123456',
        }), { EX: OTP_TTL_SECONDS });

        logger.info({ orderId }, '🔧 Dev mode: OTP bypass active — use 123456');
        return { success: true, method: 'dev' };
    }

    // ── Normalize phone number ────────────────────────────────────────────
    // Termii requires international format without + (e.g. 2348012345678)
    const normalizedPhone = normalizeNigerianPhone(customerPhone);

    // ── Primary: Termii SMS ───────────────────────────────────────────────
    try {
        const response = await axios.post(`${TERMII_API_URL}/sms/otp/send`, {
            api_key: process.env.TERMII_API_KEY,
            message_type: 'NUMERIC',
            to: normalizedPhone,
            from: process.env.TERMII_SENDER_ID || 'N-Alert',
            channel: 'generic',
            pin_attempts: 3,
            pin_time_to_live: 10,
            pin_length: 6,
            pin_placeholder: '< 1234 >',
            message_text: 'Your GrubDash delivery confirmation code is < 1234 >. Valid for 10 minutes. Do not share this code.',
            pin_type: 'NUMERIC',
        }, {
            timeout: 10000,
        });

        const pinId = response.data?.pinId || response.data?.data?.pinId;

        if (!pinId) {
            throw new Error('Termii response missing pinId');
        }

        // Store pinId in Redis for verification step
        await safeRedisSet(redisKey, JSON.stringify({
            method: 'sms',
            pinId,
            otp: null, // Termii manages OTP — we don't store it
        }), { EX: OTP_TTL_SECONDS });

        logger.info({ orderId, phone: normalizedPhone }, '✅ Delivery OTP sent via Termii SMS');
        return { success: true, method: 'sms', pinId };

    } catch (smsErr) {
        logger.warn({ orderId, error: smsErr.message }, '⚠️ Termii SMS failed — attempting email fallback');
    }

    // ── Fallback: Nodemailer email ────────────────────────────────────────
    try {
        const user = await User.findById(customerUserId).select('email firstname');
        if (!user?.email) throw new Error('Customer email not found');

        // Generate a local 6-digit OTP for email fallback
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await safeRedisSet(redisKey, JSON.stringify({
            method: 'email',
            pinId: null,
            otp,
        }), { EX: OTP_TTL_SECONDS });

        await sendMail({
            to: user.email,
            subject: 'GrubDash Delivery Confirmation Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #f97316;">GrubDash Delivery Confirmation</h2>
                    <p>Hi ${user.firstname || 'there'},</p>
                    <p>Your rider is at your location. Please provide them with this code to confirm delivery:</p>
                    <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827;">${otp}</span>
                    </div>
                    <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. Do not share it with anyone other than your rider.</p>
                </div>
            `,
        });

        logger.info({ orderId, email: user.email }, '✅ Delivery OTP sent via email fallback');
        return { success: true, method: 'email' };

    } catch (emailErr) {
        logger.error({ orderId, error: emailErr.message }, '❌ Both SMS and email OTP delivery failed');
        throw new Error('Failed to send delivery OTP via SMS and email. Please try again.');
    }
};

/**
 * Verify delivery OTP submitted by rider.
 * Handles both Termii-managed OTP (SMS) and locally-stored OTP (email/dev).
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

    // ── Dev bypass ────────────────────────────────────────────────────────
    if (method === 'dev') {
        const verified = otp === '123456';
        if (verified) {
            await safeRedisSet(redisKey, JSON.stringify({ ...otpData, verified: true }), { EX: 60 });
        }
        return { verified };
    }

    // ── Termii SMS verification ───────────────────────────────────────────
    if (method === 'sms' && pinId) {
        try {
            const response = await axios.post(`${TERMII_API_URL}/sms/otp/verify`, {
                api_key: process.env.TERMII_API_KEY,
                pin_id: pinId,
                pin: otp,
            }, { timeout: 10000 });

            const verified = response.data?.verified === true ||
                             response.data?.data?.verified === true;

            if (verified) {
                // Delete OTP from Redis — one-time use
                await safeRedisSet(redisKey, JSON.stringify({ ...otpData, verified: true }), { EX: 60 });
                logger.info({ orderId }, '✅ Delivery OTP verified via Termii');
            }

            return { verified };

        } catch (err) {
            logger.error({ orderId, error: err.message }, '❌ Termii OTP verification failed');
            throw new Error('OTP verification failed. Please try again.');
        }
    }

    // ── Email/local OTP verification ──────────────────────────────────────
    if (method === 'email' && storedOtp) {
        const verified = otp === storedOtp;
        if (verified) {
            await safeRedisSet(redisKey, JSON.stringify({ ...otpData, verified: true }), { EX: 60 });
            logger.info({ orderId }, '✅ Delivery OTP verified via email fallback');
        }
        return { verified };
    }

    throw new Error('Invalid OTP session state. Please request a new code.');
};

/**
 * Normalize Nigerian phone numbers to Termii format.
 * Accepts: 08012345678, +2348012345678, 2348012345678
 * Returns: 2348012345678
 */
const normalizeNigerianPhone = (phone) => {
    if (!phone) return phone;
    let normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');

    if (normalized.startsWith('+')) {
        normalized = normalized.slice(1);
    } else if (normalized.startsWith('0')) {
        normalized = '234' + normalized.slice(1);
    }

    return normalized;
};
