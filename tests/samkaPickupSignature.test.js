import crypto from "crypto";
import {beforeEach,expect,it,jest} from "@jest/globals";
const verify=jest.fn();
jest.unstable_mockModule("../config/prisma.js",()=>({default:{}}));
jest.unstable_mockModule("../services/logistics/pickupCode.service.js",()=>({verifySourcePickupCode:verify}));
jest.unstable_mockModule("../services/logistics/samkaLogistics.service.js",()=>({processSamkaCallback:jest.fn()}));
jest.unstable_mockModule("../services/otp.service.js",()=>({sendDeliveryOTP:jest.fn(),verifyDeliveryOTP:jest.fn()}));
jest.unstable_mockModule("../socket/events/orderEvents.js",()=>({emitDeliveryLocationUpdate:jest.fn(),emitOrderStatusUpdate:jest.fn()}));
const {validateSamkaPickupCode}=await import("../controller/integrations/samkaLogistics.controller.js");
function request(raw=JSON.stringify({sourceOrderId:"order",pickupCode:"001234"}),seconds=Math.floor(Date.now()/1000)) {const timestamp=String(seconds);const signature=crypto.createHmac("sha256","test-secret").update(`${timestamp}.${raw}`).digest("hex");return {body:Buffer.from(raw),get:key=>({"X-Logistics-Timestamp":timestamp,"X-Logistics-Signature":signature})[key]}}
const response=()=>{const res={status:jest.fn(),json:jest.fn(),end:jest.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res);return res};
beforeEach(()=>{jest.clearAllMocks();verify.mockReset();process.env.SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET="test-secret"});
it("accepts a correctly signed request and preserves leading zeros",async()=>{const res=response();await validateSamkaPickupCode(request(),res,jest.fn());expect(verify).toHaveBeenCalledWith("order","001234");expect(res.status).toHaveBeenCalledWith(204)});
it("rejects an invalid signature before attempting verification",async()=>{const req=request();req.get=()=>"invalid";const res=response();await validateSamkaPickupCode(req,res,jest.fn());expect(res.status).toHaveBeenCalledWith(401);expect(verify).not.toHaveBeenCalled()});
it("rejects replayed signed requests outside the timestamp window",async()=>{const res=response();await validateSamkaPickupCode(request(undefined,Math.floor(Date.now()/1000)-301),res,jest.fn());expect(res.status).toHaveBeenCalledWith(401);expect(verify).not.toHaveBeenCalled()});
it("preserves validation errors for the rider",async()=>{verify.mockRejectedValue(Object.assign(new Error("Incorrect pickup code"),{statusCode:422}));const res=response();await validateSamkaPickupCode(request(),res,jest.fn());expect(res.status).toHaveBeenCalledWith(422);expect(res.json).toHaveBeenCalledWith({success:false,message:"Incorrect pickup code"})});