import bcrypt from "bcryptjs";
import prisma from "../../config/prisma.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const apiRole=(role)=>role==="super_admin"?"super-admin":role==="finance_admin"?"finance-admin":role;
const dbRole=(role)=>role==="super-admin"?"super_admin":role==="finance-admin"?"finance_admin":role;
const idOf=(row)=>row?.legacyMongoId||row?.id;
const shape=(row)=>row?{...row,_id:idOf(row),id:idOf(row),role:apiRole(row.role),password:undefined,otp:undefined,loginOtpHash:undefined,resetPasswordToken:undefined,__v:0}:null;
const resolve=async(token)=>{if(!token)return null;const value=String(token);const row=await prisma.admin.findFirst({where:{OR:[...(uuid.test(value)?[{id:value}]:[]),{legacyMongoId:value}]},select:{id:true}});return row?.id||null;};
const log=async({actorId,action,targetId=null,targetModel="Admin",details="",ipAddress=null,userAgent=null,metadata={}})=>prisma.activityLog.create({data:{actorId:await resolve(actorId),actorModel:"Admin",action,targetId:targetId?await resolve(targetId):null,targetModel,metadata:{details,ipAddress,userAgent,...metadata}}});

export const adminAccountRepository={
 async get(token){const id=await resolve(token);return id?shape(await prisma.admin.findUnique({where:{id}})):null;},
 async findByEmail(email,{raw=false}={}){const row=await prisma.admin.findUnique({where:{email:String(email).trim().toLowerCase()}});return raw?row:shape(row);},
 async register({name,email,password,role}){const normalized=String(email).trim().toLowerCase();if(await prisma.admin.findUnique({where:{email:normalized}}))return{error:"exists"};const hash=await bcrypt.hash(password,12);return prisma.$transaction(async tx=>{const admin=await tx.admin.create({data:{name,email:normalized,password:hash,role:dbRole(role)}});let wallet=null;if(role==="super-admin"){wallet=await tx.wallet.create({data:{ownerId:admin.id,ownerModel:"Admin",balance:0,totalEarned:0,totalWithdrawn:0}});await tx.admin.update({where:{id:admin.id},data:{walletId:wallet.id}});}await tx.activityLog.create({data:{actorId:admin.id,actorModel:"Admin",action:"LOGIN",targetId:admin.id,targetModel:"Admin",metadata:{details:`New admin registered with role: ${role}`}}});return{admin:shape({...admin,walletId:wallet?.id||null}),wallet};});},
 async comparePassword(admin,password){return bcrypt.compare(password,admin.password);},
 async recordPasswordFailure(admin){const attempts=(admin.lockUntil&&admin.lockUntil>new Date()?admin.loginAttempts:0)+1;const locked=attempts>=5;return prisma.admin.update({where:{id:admin.id},data:{loginAttempts:locked?0:attempts,lockUntil:locked?new Date(Date.now()+15*60*1000):null}});},
 async resetLoginAttempts(id){return prisma.admin.update({where:{id},data:{loginAttempts:0,lockUntil:null}});},
 async setLoginOtp(id,{hash,expires,attempts=0}){return prisma.admin.update({where:{id},data:{loginOtpHash:hash,loginOtpExpires:expires,loginOtpAttempts:attempts}});},
 async failLoginOtp(id,attempts){return prisma.admin.update({where:{id},data:{loginOtpAttempts:attempts}});},
 async completeMfa(id,context){const admin=await prisma.$transaction(async tx=>{const updated=await tx.admin.update({where:{id},data:{loginOtpHash:null,loginOtpExpires:null,loginOtpAttempts:0,lastLogin:new Date()}});await tx.activityLog.create({data:{actorId:id,actorModel:"Admin",action:"LOGIN",targetId:id,targetModel:"Admin",metadata:context}});return updated;});return shape(admin);},
 async setResetOtp(id,otp,expires){return prisma.admin.update({where:{id},data:{otp:String(otp),otpExpires:expires}});},
 async setResetToken(id,token,expires){return prisma.admin.update({where:{id},data:{resetPasswordToken:token,resetPasswordExpires:expires,otp:null,otpExpires:null}});},
 async resetPassword(email,token,password){const admin=await prisma.admin.findFirst({where:{email:String(email).trim().toLowerCase(),resetPasswordToken:String(token),resetPasswordExpires:{gt:new Date()}}});if(!admin)return null;const updated=await prisma.admin.update({where:{id:admin.id},data:{password:await bcrypt.hash(password,12),resetPasswordToken:null,resetPasswordExpires:null,loginAttempts:0,lockUntil:null,lastLogin:new Date()}});return shape(updated);},
 async list(){return(await prisma.admin.findMany({orderBy:{createdAt:"desc"}})).map(shape);},
 async remove(token,actorToken){const id=await resolve(token);if(!id)return null;const target=await prisma.admin.findUnique({where:{id}});await prisma.$transaction(async tx=>{await tx.admin.delete({where:{id}});const actor=await resolve(actorToken);if(actor&&actor!==id)await tx.activityLog.create({data:{actorId:actor,actorModel:"Admin",action:"DELETE_ADMIN",targetId:null,targetModel:"Admin",metadata:{details:`Deleted admin account: ${target.email}`,deletedAdminId:id}}});});return shape(target);},
 async recordActivity(data){return log(data);},
 async activities({limit=10,page=1}={}){const take=Math.max(1,Math.min(100,Number(limit)||10)),skip=(Math.max(1,Number(page)||1)-1)*take;const[rows,total]=await Promise.all([prisma.activityLog.findMany({orderBy:{createdAt:"desc"},skip,take}),prisma.activityLog.count()]);const actorIds=[...new Set(rows.map(row=>row.actorId).filter(Boolean))],admins=actorIds.length?await prisma.admin.findMany({where:{id:{in:actorIds}},select:{id:true,legacyMongoId:true,name:true,email:true,role:true}}):[];const byId=Object.fromEntries(admins.map(a=>[a.id,{...a,_id:idOf(a),role:apiRole(a.role)}]));return{total,activities:rows.map(row=>({...row,_id:idOf(row),adminId:byId[row.actorId]||row.actorId,details:row.metadata?.details,ipAddress:row.metadata?.ipAddress,userAgent:row.metadata?.userAgent,targetType:row.targetModel}))};},
};
