/**
 * controller/supportChat.controller.js
 *
 * Handles POST /api/support/chat — AI-powered FAQ chatbot via Anthropic Claude.
 *
 * Design principles:
 * - Role is ALWAYS derived from req.userType (set by multiAuth middleware).
 *   It is NEVER read from req.body. Sending role in the body is silently ignored.
 * - The system prompt (FAQ content + guardrail rules) is built server-side only.
 *   The API response returns ONLY { reply } — FAQ arrays and system prompt are
 *   never echoed back to callers.
 * - Anthropic failure surfaces as 502, not swallowed. When the AI reply IS the
 *   entire purpose of the request, silent failure is unacceptable.
 */

import crypto from 'crypto';
import logger from '../config/logger.js';
import { buildSystemPrompt } from '../lib/support/faqContent.js';
import { safeRedisGet, safeRedisSet, isRedisReady } from '../config/redis.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL   = 'claude-sonnet-4-6';
const MAX_TOKENS        = 512;
const RATE_LIMIT_MAX    = 20;           // messages per window
const RATE_LIMIT_WINDOW = 60 * 60;     // 1 hour in seconds
const HISTORY_MAX       = 16;          // max history items consumed
const MESSAGE_MAX_CHARS = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Hash an IP address with the platform salt so we never store raw IPs.
 * Throws if IP_HASH_SALT is not configured — same approach as qr.controller.js.
 */
function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error('IP_HASH_SALT environment variable is required');
  }
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
}

/**
 * Per-IP-hash rolling-window rate limiter backed by Redis.
 * Key: "support_chat:{hashedIP}"
 * Value: JSON array of timestamps (Unix seconds) within the current window.
 *
 * Falls back to ALLOW if Redis is unavailable (non-fatal, matches platform pattern).
 *
 * @param {string} hashedIp
 * @returns {Promise<boolean>} true if rate limit exceeded
 */
async function isRateLimited(hashedIp) {
  if (!isRedisReady()) {
    // Redis down — don't block users, log a warning so ops can investigate
    logger.warn({ event: 'support_chat_rate_limit_redis_down' }, 'Redis unavailable — rate limit bypassed');
    return false;
  }

  const key = `support_chat:${hashedIp}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - RATE_LIMIT_WINDOW;

  try {
    const raw = await safeRedisGet(key);
    let timestamps = [];

    if (raw) {
      try {
        timestamps = JSON.parse(raw);
      } catch {
        timestamps = [];
      }
    }

    // Prune timestamps older than the rolling window
    timestamps = timestamps.filter(ts => ts > windowStart);

    if (timestamps.length >= RATE_LIMIT_MAX) {
      return true; // rate limit exceeded
    }

    // Record this request
    timestamps.push(now);
    await safeRedisSet(key, JSON.stringify(timestamps), { EX: RATE_LIMIT_WINDOW });

    return false;
  } catch (err) {
    logger.warn({ event: 'support_chat_rate_limit_error', error: err.message }, 'Rate limit check failed — allowing request');
    return false;
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/support/chat
 *
 * Inputs (from multiAuth middleware + req.body):
 *   req.userType          — 'user' (customer) or 'vendor', set by multiAuth
 *   req.userId            — authenticated user's ID
 *   req.body.message      — string, required, max 500 chars after trim
 *   req.body.history      — array of {role, content}, max 16 items, optional
 *
 * Success response: { reply: string }  ← ONLY this. Nothing else.
 */
export const handleSupportChat = async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error({ event: 'support_chat_no_api_key' }, 'ANTHROPIC_API_KEY is not configured');
    return res.status(503).json({
      error: 'The assistant is temporarily unavailable. Please email support@melachow.com.'
    });
  }

  // 2. Derive role from req.userType — NEVER from req.body
  const userType = req.userType;
  let role;

  if (userType === 'user') {
    role = 'customer';
  } else if (userType === 'vendor') {
    role = 'vendor';
  } else {
    return res.status(400).json({
      error: 'Support chat is not available for your account type.'
    });
  }

  const userId = req.userId;

  // 3. Validate req.body.message
  const rawMessage = req.body?.message;

  if (rawMessage === undefined || rawMessage === null) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (typeof rawMessage !== 'string') {
    return res.status(400).json({ error: 'Message must be a string.' });
  }

  const message = rawMessage.trim();

  if (message.length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  if (message.length > MESSAGE_MAX_CHARS) {
    return res.status(400).json({
      error: `Message is too long. Maximum ${MESSAGE_MAX_CHARS} characters allowed.`
    });
  }

  // 4. Validate and truncate req.body.history
  //    Must be an array. Silently truncate to last HISTORY_MAX items if longer.
  //    Each item must have role ('user'|'assistant') and content (string).
  let history = [];

  if (req.body?.history !== undefined) {
    if (!Array.isArray(req.body.history)) {
      return res.status(400).json({ error: 'History must be an array.' });
    }

    // Truncate to last 16 items silently
    const rawHistory = req.body.history.slice(-HISTORY_MAX);

    history = rawHistory
      .filter(item =>
        item &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string'
      )
      .map(item => ({ role: item.role, content: item.content }));
  }

  // 5. IP-hash rate limit — 20 messages per IP per rolling hour
  let hashedIp;
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '0.0.0.0';
    hashedIp = hashIp(ip);
  } catch (err) {
    logger.error({ event: 'support_chat_ip_hash_error', error: err.message }, 'Failed to hash IP');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  const limited = await isRateLimited(hashedIp);
  if (limited) {
    return res.status(429).json({
      error: 'Too many messages. Please wait before sending more.'
    });
  }

  // 6. Build system prompt from FAQ content for this role
  const systemPrompt = buildSystemPrompt(role);

  // 7. Construct the Anthropic messages array:
  //    [...validated history, current user message]
  const anthropicMessages = [
    ...history,
    { role: 'user', content: message },
  ];

  // 8. Call Anthropic Claude
  let anthropicRes;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });
  } catch (networkErr) {
    // Network-level failure (no response received)
    logger.error(
      { event: 'support_chat_error', role, userId, error: networkErr.message },
      'Anthropic API network error'
    );
    return res.status(502).json({
      error: 'The assistant is temporarily unavailable. Please try again or email support@melachow.com.'
    });
  }

  // 9. Handle non-2xx from Anthropic
  if (!anthropicRes.ok) {
    let errDetail = anthropicRes.status;
    try {
      const errBody = await anthropicRes.json();
      errDetail = errBody?.error?.message || errDetail;
    } catch { /* ignore */ }

    logger.error(
      { event: 'support_chat_error', role, userId, error: String(errDetail) },
      'Anthropic API returned non-2xx'
    );
    return res.status(502).json({
      error: 'The assistant is temporarily unavailable. Please try again or email support@melachow.com.'
    });
  }

  // 10. Extract reply and return ONLY { reply } — nothing else
  let data;
  try {
    data = await anthropicRes.json();
  } catch (parseErr) {
    logger.error(
      { event: 'support_chat_error', role, userId, error: parseErr.message },
      'Failed to parse Anthropic response'
    );
    return res.status(502).json({
      error: 'The assistant is temporarily unavailable. Please try again or email support@melachow.com.'
    });
  }

  const reply = data?.content?.[0]?.text;

  if (!reply) {
    logger.error(
      { event: 'support_chat_error', role, userId, error: 'Empty content from Anthropic' },
      'Anthropic returned no text content'
    );
    return res.status(502).json({
      error: 'The assistant is temporarily unavailable. Please try again or email support@melachow.com.'
    });
  }

  logger.info({ event: 'support_chat_response', role, userId }, 'Support chat response delivered');

  // Return ONLY the reply — FAQ arrays and system prompt are never exposed
  return res.status(200).json({ reply });
};
