import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../utils/jwt.js";
import { isTokenBlocked } from "../../middleware/tokenBlocklist.js";
import {
  findIdentityByTokenId,
  postgresUserIdentityEnabled,
  publicUser,
} from "../postgres/userIdentity.repository.js";
import User from "../../model/user.model.js";

const SAMKA_CALL_ISSUER = "samkatech-logistics";
const SAMKA_CALL_AUDIENCE = "melachow-voice-calling";

function getSamkaCallSigningSecret() {
  return String(
    process.env.CALL_SIGNING_SECRET ||
      process.env.SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET ||
      ""
  ).trim();
}

function buildDisplayName(user) {
  if (!user) return "Customer";
  const full =
    user.fullName ||
    user.name ||
    [user.firstname || user.firstName, user.lastname || user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
  return full || "Customer";
}

/**
 * Verifies a short-lived Samka Rider Call Token minted by SamkaTech.Logistics.
 * Returns normalized call actor or null if token is not a Samka rider call token.
 */
export function verifySamkaRiderCallToken(token) {
  if (!token) return null;
  const secret = getSamkaCallSigningSecret();
  if (!secret) return null;

  let unverified;
  try {
    unverified = jwt.decode(token);
  } catch {
    return null;
  }

  if (!unverified || unverified.typ !== "samka_rider_call") {
    return null;
  }

  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: SAMKA_CALL_ISSUER,
    audience: SAMKA_CALL_AUDIENCE,
  });

  if (decoded.typ !== "samka_rider_call" || decoded.role !== "samka_rider") {
    throw new Error("Invalid Samka rider call token claims");
  }

  const riderId = String(decoded.sub || decoded.riderId || "").trim();
  if (!riderId) {
    throw new Error("Samka rider call token missing rider identity");
  }

  return {
    role: "rider",
    provider: "samka",
    actorId: riderId,
    riderId,
    legacyId: null,
    name: String(decoded.name || "Rider").trim() || "Rider",
    deliveryId: decoded.deliveryId ? String(decoded.deliveryId).trim() : null,
  };
}

/**
 * Authenticates either a MelaChow Customer JWT or a Samka Rider Call Token.
 */
export async function authenticateCallToken(token) {
  if (!token || typeof token !== "string") {
    const err = new Error("Authentication token required");
    err.statusCode = 401;
    throw err;
  }

  const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
  if (!cleanToken) {
    const err = new Error("Authentication token required");
    err.statusCode = 401;
    throw err;
  }

  // 1. Check if this is a Samka Rider Call Token
  try {
    const samkaActor = verifySamkaRiderCallToken(cleanToken);
    if (samkaActor) return samkaActor;
  } catch (err) {
    const authErr = new Error("Invalid or expired rider call session");
    authErr.statusCode = 401;
    authErr.cause = err;
    throw authErr;
  }

  // 2. Otherwise verify as a MelaChow Customer access JWT
  if (await isTokenBlocked(cleanToken)) {
    const err = new Error("Session has been revoked");
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(cleanToken, JWT_SECRET);
  } catch {
    const err = new Error("Invalid or expired authentication token");
    err.statusCode = 401;
    throw err;
  }

  if (decoded.type !== "access") {
    const err = new Error("Access token required");
    err.statusCode = 401;
    throw err;
  }

  const role = decoded.role || "user";
  if (role !== "user") {
    const err = new Error("Only authenticated customers and assigned riders can use calling");
    err.statusCode = 403;
    throw err;
  }

  const targetId = decoded.id || decoded.userId;
  if (!targetId) {
    const err = new Error("Invalid authentication token payload");
    err.statusCode = 401;
    throw err;
  }

  let pgUser = null;
  let identity = null;
  if (postgresUserIdentityEnabled()) {
    pgUser = await findIdentityByTokenId(targetId);
    identity = pgUser ? publicUser(pgUser) : null;
  } else {
    identity = await User.findById(targetId).select("-password").lean();
  }

  if (!identity) {
    const err = new Error("Customer account not found");
    err.statusCode = 401;
    throw err;
  }

  if (identity.deletedAt || identity.suspended || identity.banned || identity.isActive === false) {
    const err = new Error("Account is inactive");
    err.statusCode = 403;
    throw err;
  }

  const canonicalId = String(pgUser?.id || identity.id || identity._id);
  const legacyId = pgUser?.legacyMongoId
    ? String(pgUser.legacyMongoId)
    : identity._id && String(identity._id) !== canonicalId
      ? String(identity._id)
      : null;

  return {
    role: "customer",
    provider: "melachow",
    actorId: canonicalId,
    postgresUserId: canonicalId,
    legacyId,
    name: buildDisplayName(pgUser || identity),
    email: identity.email || null,
  };
}

/**
 * Express middleware that authenticates either a MelaChow Customer or Samka Rider.
 */
export async function authenticateCallParticipant(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token =
      (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) ||
      req.cookies?.token ||
      null;

    req.callActor = await authenticateCallToken(token);
    return next();
  } catch (err) {
    return res.status(err.statusCode || 401).json({
      success: false,
      message: err.message || "Authentication required",
    });
  }
}
