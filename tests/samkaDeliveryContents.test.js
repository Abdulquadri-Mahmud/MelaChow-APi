import { describe, expect, it } from "@jest/globals";
import { deliveryContentsFrom } from "../services/logistics/deliveryContents.js";
describe("Samka delivery contents", () => {
 it("sends store, item quantities and sizes without customer or payment data", () => {
  expect(deliveryContentsFrom({restaurant:{storeName:"Mela Kitchen"},items:[{name:"fried rice",quantity:1,portion_label:"Regular",portion_quantity:2,price:800,note:"private"}]})).toEqual({pickupBusinessName:"Mela Kitchen",items:[{name:"fried rice",quantity:1,description:"Size: Regular ×2"}]});
 });
 it("supports older orders without metadata",()=>expect(deliveryContentsFrom({})).toEqual({pickupBusinessName:null,items:[]}));
 it("uses the recorded food name and quantity",()=>expect(deliveryContentsFrom({items:[{foodId:{name:"Bread"},quantity:3}]}).items).toEqual([{name:"Bread",quantity:3,description:null}]));
 it("rejects invalid quantities",()=>{for(const quantity of [0,-1,1.5,"invalid"])expect(()=>deliveryContentsFrom({items:[{name:"Rice",quantity}]})).toThrow("positive integer")});
 it("rejects oversized manifests without dropping packages",()=>expect(()=>deliveryContentsFrom({items:Array.from({length:101},()=>({name:"Package",quantity:1}))})).toThrow("100 item lines"));
});