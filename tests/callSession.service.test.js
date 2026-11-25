import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import {
  CALL_STATES,
  ALLOWED_TRANSITIONS,
  serializeCallSession,
} from "../services/call/callSession.service.js";
import { verifySamkaRiderCallToken } from "../services/call/callAuth.service.js";
import { getIceServersForActor } from "../services/call/turnCredentials.service.js";

describe("In-App Voice Calling Backend Core", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe("Call State Machine", () => {
    it("enforces valid transitions and blocks invalid ones", () => {
      expect(ALLOWED_TRANSITIONS[CALL_STATES.INITIATING].has(CALL_STATES.RINGING)).toBe(true);
      expect(ALLOWED_TRANSITIONS[CALL_STATES.RINGING].has(CALL_STATES.CONNECTING)).toBe(true);
      expect(ALLOWED_TRANSITIONS[CALL_STATES.RINGING].has(CALL_STATES.REJECTED)).toBe(true);
      expect(ALLOWED_TRANSITIONS[CALL_STATES.RINGING].has(CALL_STATES.MISSED)).toBe(true);
      expect(ALLOWED_TRANSITIONS[CALL_STATES.RINGING].has(CALL_STATES.CANCELLED)).toBe(true);
      expect(ALLOWED_TRANSITIONS[CALL_STATES.CONNECTING].has(CALL_STATES.CONNECTED)).toBe(true);
      expect(ALLOWED_TRANSITIONS[CALL_STATES.CONNECTED].has(CALL_STATES.ENDED)).toBe(true);

      // Terminal states must have no outgoing transitions
      expect(ALLOWED_TRANSITIONS[CALL_STATES.ENDED]).toBeUndefined();
      expect(ALLOWED_TRANSITIONS[CALL_STATES.REJECTED]).toBeUndefined();
      expect(ALLOWED_TRANSITIONS[CALL_STATES.MISSED]).toBeUndefined();
      expect(ALLOWED_TRANSITIONS[CALL_STATES.CANCELLED]).toBeUndefined();
      expect(ALLOWED_TRANSITIONS[CALL_STATES.FAILED]).toBeUndefined();
    });

    it("serializes call session without exposing phone numbers", () => {
      const now = new Date();
      const serialized = serializeCallSession(
        {
          id: "11111111-1111-1111-1111-111111111111",
          orderId: "22222222-2222-2222-2222-222222222222",
          vendorOrderId: "33333333-3333-3333-3333-333333333333",
          externalDeliveryId: "44444444-4444-4444-4444-444444444444",
          orderCode: "MC-1024",
          status: CALL_STATES.RINGING,
          callerRole: "customer",
          calleeRole: "rider",
          customerDisplayName: "Adaeze",
          riderDisplayName: "Tunde",
          riderAvatarUrl: "https://cdn.example.com/rider.jpg",
          ringingAt: now,
          expiresAt: new Date(now.getTime() + 35000),
          createdAt: now,
        },
        "customer"
      );

      expect(serialized.callId).toBe("11111111-1111-1111-1111-111111111111");
      expect(serialized.peerName).toBe("Tunde");
      expect(serialized.peerAvatar).toBe("https://cdn.example.com/rider.jpg");
      expect(serialized).not.toHaveProperty("phone");
      expect(serialized).not.toHaveProperty("riderPhone");
      expect(serialized).not.toHaveProperty("customerPhone");
    });
  });

  describe("Samka Rider Call Token Verification", () => {
    it("verifies a valid short-lived Samka rider call token", () => {
      process.env.SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET = "test-shared-secret-32-chars-minimum!!";
      const token = jwt.sign(
        {
          sub: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          typ: "samka_rider_call",
          role: "samka_rider",
          name: "Musa Rider",
          deliveryId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        },
        process.env.SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET,
        {
          algorithm: "HS256",
          issuer: "samkatech-logistics",
          audience: "melachow-voice-calling",
          expiresIn: "15m",
        }
      );

      const actor = verifySamkaRiderCallToken(token);
      expect(actor).toEqual({
        role: "rider",
        provider: "samka",
        actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        riderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        legacyId: null,
        name: "Musa Rider",
        deliveryId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      });
    });

    it("rejects a tampered Samka rider call token", () => {
      process.env.SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET = "real-secret-key-1234567890";
      const badToken = jwt.sign(
        {
          sub: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          typ: "samka_rider_call",
          role: "samka_rider",
        },
        "wrong-secret",
        {
          algorithm: "HS256",
          issuer: "samkatech-logistics",
          audience: "melachow-voice-calling",
          expiresIn: "15m",
        }
      );

      expect(() => verifySamkaRiderCallToken(badToken)).toThrow();
    });
  });

  describe("TURN Ephemeral Credentials", () => {
    it("generates Coturn HMAC ephemeral credentials when configured", async () => {
      process.env.TURN_URLS = "turn:turn.melachow.com:3478,turns:turn.melachow.com:5349";
      process.env.TURN_SHARED_SECRET = "super-secret-coturn-key";
      process.env.TURN_TTL_SECONDS = "600";

      const result = await getIceServersForActor("user-123");
      expect(result.hasTurn).toBe(true);
      expect(result.ttlSeconds).toBe(600);
      expect(result.iceServers.length).toBe(2);
      expect(result.iceServers[1].urls).toEqual([
        "turn:turn.melachow.com:3478",
        "turns:turn.melachow.com:5349",
      ]);
      expect(result.iceServers[1].username).toMatch(/^\d+:[a-f0-9]{16}$/);
      expect(result.iceServers[1].credential).toBeTruthy();
    });

    it("falls back to STUN servers when TURN env vars are not set", async () => {
      delete process.env.TURN_URLS;
      delete process.env.TURN_SHARED_SECRET;
      delete process.env.METERED_DOMAIN;
      delete process.env.METERED_API_KEY;

      const result = await getIceServersForActor("user-123");
      expect(result.hasTurn).toBe(false);
      expect(result.iceServers[0].urls.length).toBeGreaterThan(0);
    });
  });
});
