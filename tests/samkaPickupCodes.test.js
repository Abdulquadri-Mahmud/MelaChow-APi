import { beforeEach, describe, expect, it, jest } from "@jest/globals";
const tx={vendorOrder:{findUnique:jest.fn()},logisticsDelivery:{findUnique:jest.fn(),findFirst:jest.fn()},deliveryOtpSession:{findUnique:jest.fn(),upsert:jest.fn(),update:jest.fn()},$queryRaw:jest.fn()};
const db={$transaction:jest.fn(fn=>fn(tx))};
jest.unstable_mockModule("../config/prisma.js",()=>({default:db}));
const {issueVendorPickupCode,verifySourcePickupCode}=await import("../services/logistics/pickupCode.service.js");
const id="11111111-1111-4111-8111-111111111111";
const order={id,restaurantId:"vendor",orderStatus:"ready_for_pickup",restaurant:{legacyMongoId:"legacy-vendor",deliveryManagedBy:"admin"},userOrder:{paymentStatus:"paid"}};
const delivery={vendorOrderId:id,sourceOrderId:id,dispatchStatus:"dispatched",vendorOrder:order};
const session=()=>({key:`samka_pickup:${id}`,expiresAt:new Date(Date.now()+60000),payload:{kind:"pickup",sourceOrderId:id,pickupCode:"001234",attempts:0}});
beforeEach(()=>{jest.clearAllMocks();tx.vendorOrder.findUnique.mockResolvedValue(order);tx.logisticsDelivery.findUnique.mockResolvedValue(delivery);tx.logisticsDelivery.findFirst.mockResolvedValue(delivery);tx.deliveryOtpSession.findUnique.mockResolvedValue(session());tx.$queryRaw.mockResolvedValue([])});
describe("Merchant pickup codes",()=>{
 it("returns an unexpired code to the owning vendor without regenerating",async()=>{const code=await issueVendorPickupCode(id,"vendor");expect(code.pickupCode).toBe("001234");expect(tx.deliveryOtpSession.upsert).not.toHaveBeenCalled();expect(tx.$queryRaw).toHaveBeenCalled()});
 it("accepts the owning vendor's legacy identity",async()=>expect((await issueVendorPickupCode(id,"legacy-vendor")).pickupCode).toBe("001234"));
 it("does not disclose codes to another vendor",async()=>{await expect(issueVendorPickupCode(id,"other")).rejects.toMatchObject({statusCode:404});expect(tx.deliveryOtpSession.findUnique).not.toHaveBeenCalled()});
 it("issues a durable six digit code when no session exists",async()=>{tx.deliveryOtpSession.findUnique.mockResolvedValue(null);const code=await issueVendorPickupCode(id,"vendor");expect(code.pickupCode).toMatch(/^\d{6}$/);expect(tx.deliveryOtpSession.upsert.mock.calls[0][0].create.payload.kind).toBe("pickup");expect(code.expiresAt.getTime()).toBeGreaterThan(Date.now()+29*60000)});
 it("renews expired or exhausted sessions",async()=>{for(const change of [{expiresAt:new Date(0)},{payload:{...session().payload,attempts:5}}]){tx.deliveryOtpSession.findUnique.mockResolvedValue({...session(),...change});await issueVendorPickupCode(id,"vendor")}expect(tx.deliveryOtpSession.upsert).toHaveBeenCalledTimes(2)});
 it("rejects unpaid or unready orders",async()=>{for(const change of [{userOrder:{paymentStatus:"pending"}},{orderStatus:"preparing"}]){tx.vendorOrder.findUnique.mockResolvedValue({...order,...change});await expect(issueVendorPickupCode(id,"vendor")).rejects.toMatchObject({statusCode:409})}});
 it("cannot generate a code for a cancelled delivery",async()=>{tx.logisticsDelivery.findUnique.mockResolvedValue({...delivery,dispatchStatus:"terminal"});await expect(issueVendorPickupCode(id,"vendor")).rejects.toMatchObject({statusCode:409})});
});
describe("Signed source pickup verification",()=>{
 it("preserves leading zeros and permits retry after the Samka save fails",async()=>{await verifySourcePickupCode(id,"001234");await verifySourcePickupCode(id,"001234");expect(tx.deliveryOtpSession.update).not.toHaveBeenCalled()});
 it("commits a failed attempt before reporting an incorrect code",async()=>{await expect(verifySourcePickupCode(id,"999999")).rejects.toMatchObject({statusCode:422});expect(tx.deliveryOtpSession.update.mock.calls[0][0].data.payload.attempts).toBe(1);expect(tx.$queryRaw).toHaveBeenCalled()});
 it("rejects missing, expired and other-order sessions",async()=>{for(const value of [null,{...session(),expiresAt:new Date(0)},{...session(),payload:{...session().payload,sourceOrderId:"other"}}]){tx.deliveryOtpSession.findUnique.mockResolvedValue(value);await expect(verifySourcePickupCode(id,"001234")).rejects.toMatchObject({statusCode:422})}});
 it("limits guesses and requires a new merchant code",async()=>{tx.deliveryOtpSession.findUnique.mockResolvedValue({...session(),payload:{...session().payload,attempts:5}});await expect(verifySourcePickupCode(id,"001234")).rejects.toMatchObject({statusCode:429})});
 it("rejects malformed input before accessing the database",async()=>{await expect(verifySourcePickupCode(id,"123")).rejects.toMatchObject({statusCode:400});expect(tx.logisticsDelivery.findFirst).not.toHaveBeenCalled()});
 it("rejects completed or unready orders",async()=>{tx.logisticsDelivery.findFirst.mockResolvedValue({...delivery,vendorOrder:{...order,orderStatus:"out_for_delivery"}});await expect(verifySourcePickupCode(id,"001234")).rejects.toMatchObject({statusCode:409})});
});