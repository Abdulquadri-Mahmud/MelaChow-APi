import "dotenv/config";
import prisma from "../config/prisma.js";
import { supportRepository } from "../services/postgres/support.repository.js";

let id;
try {
  const user=await prisma.user.findFirst({select:{id:true,legacyMongoId:true,firstname:true}});if(!user)throw new Error("No user available");const token=user.legacyMongoId||user.id;
  const ticket=await supportRepository.create({userId:token,subject:"Support smoke ticket",message:"Testing PostgreSQL support mutations safely.",category:"app_bug",priority:"normal",customerName:user.firstname||"Smoke",conversation:[{body:"Testing PostgreSQL support mutations safely.",senderRole:"customer",senderId:token,senderName:user.firstname||"Smoke",attachments:[]}],firstResponseDueAt:new Date(Date.now()+3600000),resolutionDueAt:new Date(Date.now()+7200000)});id=ticket.id;
  const reply=await supportRepository.addMessage(id,{role:"customer",ownerToken:token,body:"Additional smoke detail",senderName:"Smoke"});if(!reply||reply.conversation.length!==2)throw new Error("Customer reply failed");
  const updated=await supportRepository.adminUpdate(id,{status:"pending",priority:"high",note:"Smoke note",admin:{name:"Smoke Admin"}});if(updated.status!=="pending"||updated.priority!=="high"||updated.adminNotes.length!==1)throw new Error("Admin update failed");
  const mine=await supportRepository.get(id,token);if(!mine)throw new Error("Owner read failed");
  console.log(JSON.stringify({ok:true,create:true,customerReply:true,adminMutation:true,ownerRead:true},null,2));
}catch(error){console.error(JSON.stringify({ok:false,error:error.message},null,2));process.exitCode=1;}finally{if(id)await prisma.supportTicket.delete({where:{id}}).catch(()=>{});await prisma.$disconnect();}
