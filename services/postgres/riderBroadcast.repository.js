import prisma from "../../config/prisma.js";
import { BROADCAST_TTL_SECONDS, RIDER_FIXED_PAYOUT } from "../../config/payouts.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyId = (row) => row?.legacyMongoId || row?.id || null;
const resolve = async (model, token) => {
  if (!token) return null;
  const value=String(token); const row=await model.findFirst({where:{OR:[...(uuidPattern.test(value)?[{id:value}]:[]),{legacyMongoId:value}]},select:{id:true}}); return row?.id||null;
};
const resolveLocation = async (model, token) => token ? resolve(model, typeof token === "object" ? token._id || token.id : token) : null;

export const riderBroadcastRepository = {
  async expire(riderTokens = []) {
    const riderIds=(await Promise.all(riderTokens.map((token)=>resolve(prisma.rider,token)))).filter(Boolean); if(!riderIds.length)return{expiredCount:0,riderIds:[]};
    const stale=await prisma.riderAssignment.findMany({where:{riderId:{in:riderIds},status:"pending",expiresAt:{lte:new Date()}},select:{id:true,riderId:true}}); if(!stale.length)return{expiredCount:0,riderIds:[]};
    const staleRiders=[...new Set(stale.map((row)=>row.riderId).filter(Boolean))];
    await prisma.$transaction([prisma.riderAssignment.updateMany({where:{id:{in:stale.map((row)=>row.id)}},data:{status:"timeout",respondedAt:new Date(),reason:"assignment_expired"}}),prisma.rider.updateMany({where:{id:{in:staleRiders},status:"pending_assignment"},data:{status:"available",assignmentExpiresAt:null,currentOrderId:null}})]);
    return{expiredCount:stale.length,riderIds:staleRiders};
  },

  async offer(vendorOrderToken,{assignedBy=null}={}) {
    const vendorOrderId=await resolve(prisma.vendorOrder,vendorOrderToken); if(!vendorOrderId)return{success:false,reason:"order_not_found",riderCount:0};
    const vendorOrder=await prisma.vendorOrder.findUnique({where:{id:vendorOrderId},include:{userOrder:{include:{items:true}},restaurant:{select:{id:true,legacyMongoId:true,storeName:true,cityId:true,stateId:true}}}}); if(!vendorOrder?.userOrder)return{success:false,reason:"order_not_found",riderCount:0};
    const order=vendorOrder.userOrder, delivery=order.deliveryAddress||{};
    const [deliveryCityId,deliveryStateId]=await Promise.all([resolveLocation(prisma.city,delivery.cityId),resolveLocation(prisma.state,delivery.stateId)]); const cityId=deliveryCityId||vendorOrder.restaurant.cityId,stateId=deliveryStateId||vendorOrder.restaurant.stateId;
    if(!cityId||!stateId)return{success:false,reason:"missing_location",riderCount:0};
    const candidates=await prisma.rider.findMany({where:{cityId,stateId,status:"available",currentOrderId:null,isActive:true,isVerified:true,deletedAt:null}});
    await this.expire(candidates.map((row)=>row.id));
    const rejections=await prisma.riderAssignment.findMany({where:{vendorOrderId,status:"rejected",reason:{notIn:["rider_terminated","admin_unassigned"]}},select:{riderId:true}});
    const excluded=new Set(rejections.map((row)=>row.riderId).filter(Boolean));
    const riders=candidates.filter((row)=>!excluded.has(row.id)&&!row.metadata?.isSuspended);
    if(!riders.length){await prisma.orderBroadcastQueue.upsert({where:{vendorOrderId},create:{orderId:order.id,vendorOrderId,cityId,stateId,status:"waiting",attemptCount:1},update:{status:"waiting",attemptCount:{increment:1}}});return{success:false,reason:"no_new_riders_to_broadcast",riderCount:0,orderId:legacyId(order),orderDatabaseId:order.id,vendorId:legacyId(vendorOrder.restaurant),userId:order.userId};}
    const expiresAt=new Date(Date.now()+BROADCAST_TTL_SECONDS*1000),statusLog=Array.isArray(order.statusLog)?order.statusLog:[];
    const reservedRiders=[];
    await prisma.$transaction(async(tx)=>{
      const changed=await tx.order.updateMany({where:{id:order.id,riderId:null,orderStatus:{in:["ready_for_pickup","rider_assigned"]}},data:{orderStatus:"rider_assigned",riderAssignment:{status:"assigned",assignedAt:new Date().toISOString(),acceptedAt:null,rejectedAt:null,expiresAt:expiresAt.toISOString(),lastReason:"",assignedBy},statusLog:[...statusLog,{status:"rider_assigned",changedBy:assignedBy||"system:auto_assignment",timestamp:new Date().toISOString()}]}});if(changed.count!==1)throw new Error("Order could not be transitioned to rider_assigned");
      await tx.vendorOrder.updateMany({where:{userOrderId:order.id},data:{orderStatus:"rider_assigned"}});
      for(const rider of riders){const claimed=await tx.rider.updateMany({where:{id:rider.id,status:"available",currentOrderId:null},data:{status:"pending_assignment",assignmentExpiresAt:expiresAt}});if(claimed.count!==1)continue;reservedRiders.push(rider);await tx.riderAssignment.create({data:{orderId:order.id,vendorOrderId,riderId:rider.id,vendorId:vendorOrder.restaurantId,stateId,cityId,status:"pending",expiresAt,metadata:{assignedBy,assignedAt:new Date().toISOString(),restaurantName:vendorOrder.restaurant.storeName,orderReadableId:order.orderCode,assignmentMode:"automatic"}}});}if(!reservedRiders.length)throw new Error("No riders remained available when the broadcast was reserved");
      await tx.orderBroadcastQueue.upsert({where:{vendorOrderId},create:{orderId:order.id,vendorOrderId,cityId,stateId,status:"broadcasting",attemptCount:1,lastAttemptAt:new Date()},update:{status:"broadcasting",lastAttemptAt:new Date(),attemptCount:{increment:1}}});
    });
    const config=await prisma.platformConfig.findUnique({where:{type:"singleton"},select:{value:true}});
    return{success:true,riderCount:reservedRiders.length,riderIds:reservedRiders.map(legacyId),riders:reservedRiders.map((row)=>({_id:legacyId(row),id:legacyId(row)})),assignmentExpiresAt:expiresAt,order:{...order,_id:legacyId(order)},vendor:{...vendorOrder.restaurant,_id:legacyId(vendorOrder.restaurant)},vendorOrderId:legacyId(vendorOrder),vendorOrderDatabaseId:vendorOrder.id,riderPayout:Number(config?.value?.riderFixedPayout??RIDER_FIXED_PAYOUT)};
  },

  async timeoutContext(vendorOrderToken,orderToken){const vendorOrderId=await resolve(prisma.vendorOrder,vendorOrderToken),orderId=await resolve(prisma.order,orderToken);if(!vendorOrderId||!orderId)return null;return prisma.vendorOrder.findFirst({where:{id:vendorOrderId,userOrderId:orderId},include:{userOrder:true,restaurant:{select:{id:true,legacyMongoId:true}}}});},
  async catchup(riderToken){const riderId=await resolve(prisma.rider,riderToken);if(!riderId)return{success:false,reason:"rider_not_eligible"};const rider=await prisma.rider.findUnique({where:{id:riderId}});if(!rider||!["available","pending_assignment"].includes(rider.status)||rider.currentOrderId)return{success:false,reason:"rider_not_eligible"};const queued=await prisma.orderBroadcastQueue.findFirst({where:{status:"waiting",cityId:rider.cityId},orderBy:{queuedAt:"asc"}});if(queued){const result=await this.offer(queued.vendorOrderId,{assignedBy:"system:catchup_queue"});return{success:true,broadcasted:result.success?1:0};}const orders=await prisma.vendorOrder.findMany({where:{orderStatus:{in:["ready_for_pickup","rider_assigned"]},userOrder:{riderId:null}},take:5});let count=0;for(const order of orders){const result=await this.offer(order.id);if(result.success)count++;}return{success:true,broadcasted:count};}
};
