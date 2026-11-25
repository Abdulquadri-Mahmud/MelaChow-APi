import crypto from "crypto";

const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

let meteredCache = {
  iceServers: null,
  expiresAt: 0,
};

function parseCsvUrls(raw, fallback = []) {
  if (!raw || typeof raw !== "string") return fallback;
  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function generateCoturnEphemeralCredentials(actorId, ttlSeconds) {
  const secret = String(process.env.TURN_SHARED_SECRET || "").trim();
  const urls = parseCsvUrls(process.env.TURN_URLS);
  if (!secret || urls.length === 0) return null;

  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const opaqueActor = crypto
    .createHash("sha256")
    .update(String(actorId || "anon"))
    .digest("hex")
    .slice(0, 16);
  const username = `${expiry}:${opaqueActor}`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return [
    {
      urls,
      username,
      credential,
    },
  ];
}

async function fetchMeteredTurnCredentials() {
  const domain = String(process.env.METERED_DOMAIN || "").trim();
  const apiKey = String(process.env.METERED_API_KEY || "").trim();
  if (!domain || !apiKey) return null;

  const now = Date.now();
  if (meteredCache.iceServers && meteredCache.expiresAt > now) {
    return meteredCache.iceServers;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const cleanDomain = domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const response = await fetch(
      `https://${cleanDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      throw new Error(`Metered TURN API returned HTTP ${response.status}`);
    }
    const servers = await response.json();
    if (!Array.isArray(servers) || servers.length === 0) {
      return null;
    }
    meteredCache = {
      iceServers: servers,
      expiresAt: now + 5 * 60 * 1000, // Cache for 5 minutes
    };
    return servers;
  } catch (err) {
    console.warn("[TURN] Failed to fetch Metered TURN credentials:", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getStaticTurnCredentials() {
  const urls = parseCsvUrls(process.env.TURN_URLS);
  const username = String(process.env.TURN_USERNAME || "").trim();
  const credential = String(process.env.TURN_CREDENTIAL || "").trim();
  if (urls.length === 0 || !username || !credential) return null;

  return [
    {
      urls,
      username,
      credential,
    },
  ];
}

/**
 * Returns short-lived ICE server configuration (STUN + TURN) for an authenticated caller/callee.
 * Never hardcodes TURN secrets in frontend bundles.
 */
export async function getIceServersForActor(actorId) {
  const ttlSeconds = Math.max(
    120,
    Math.min(3600, Number(process.env.TURN_TTL_SECONDS) || 600)
  );
  const stunUrls = parseCsvUrls(process.env.STUN_URLS, DEFAULT_STUN_URLS);
  const iceServers = [{ urls: stunUrls }];
  let hasTurn = false;

  // Priority 1: Coturn HMAC ephemeral credentials (recommended self-hosted open-source)
  const coturn = generateCoturnEphemeralCredentials(actorId, ttlSeconds);
  if (coturn) {
    iceServers.push(...coturn);
    hasTurn = true;
  } else {
    // Priority 2: Metered.ca managed free/paid TURN API
    const metered = await fetchMeteredTurnCredentials();
    if (metered) {
      iceServers.push(...metered);
      hasTurn = true;
    } else {
      // Priority 3: Static TURN credentials via server env vars
      const staticTurn = getStaticTurnCredentials();
      if (staticTurn) {
        iceServers.push(...staticTurn);
        hasTurn = true;
      }
    }
  }

  return {
    iceServers,
    ttlSeconds,
    hasTurn,
  };
}
