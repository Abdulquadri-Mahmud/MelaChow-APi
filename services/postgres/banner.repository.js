import prisma from "../../config/prisma.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resolve=async(model,v)=>!v?null:uuid.test(String(v))?String(v):(await model.findUnique({where:{legacyMongoId:String(v)},select:{id:true}}))?.id||null;
const include={createdBy:{select:{id:true,legacyMongoId:true,name:true,email:true}}};
const shape=b=>b?({...b,_id:b.legacyMongoId||b.id,createdBy:b.createdBy?{...b.createdBy,_id:b.createdBy.legacyMongoId||b.createdBy.id}:b.createdById,linkedRestaurantId:b.linkedRestaurantId,linkedCategoryId:b.linkedCategoryId}):null;
const data=async(input)=>({title:input.title,subtitle:input.subtitle||"",description:input.description||"",bannerType:input.bannerType,contentStyle:input.contentStyle,imageUrl:input.imageUrl||"",mobileImageUrl:input.mobileImageUrl||"",backgroundGradient:input.backgroundGradient||{},backgroundColor:input.backgroundColor||"",textColor:input.textColor||"",accentColor:input.accentColor||"",ctaText:input.ctaText||"",ctaLink:input.ctaLink||"",linkedRestaurantId:input.linkedRestaurantId?await resolve(prisma.vendor,input.linkedRestaurantId):null,linkedCategoryId:input.linkedCategoryId?await resolve(prisma.category,input.linkedCategoryId):null,icon:input.icon||"",isActive:input.isActive!==false,displayOrder:Number(input.displayOrder||0),startDate:input.startDate?new Date(input.startDate):null,endDate:input.endDate?new Date(input.endDate):null});
export const bannerRepository={
 async publicList(){const now=new Date();return(await prisma.banner.findMany({where:{isActive:true,OR:[{startDate:null},{startDate:{lte:now}}],AND:[{OR:[{endDate:null},{endDate:{gt:now}}]}]},orderBy:[{displayOrder:"asc"},{createdAt:"desc"}]})).map(shape);},
 async list(){return(await prisma.banner.findMany({include,orderBy:[{displayOrder:"asc"},{createdAt:"desc"}]})).map(shape);},
 async get(token){const id=await resolve(prisma.banner,token);return id?shape(await prisma.banner.findUnique({where:{id},include})):null;},
 async create(input,adminToken){const createdById=await resolve(prisma.admin,adminToken);if(!createdById)throw new Error("Admin not found");return shape(await prisma.banner.create({data:{...(await data(input)),createdById},include}));},
 async update(token,input){const id=await resolve(prisma.banner,token);if(!id)return null;return shape(await prisma.banner.update({where:{id},data:await data(input),include}));},
 async remove(token){const id=await resolve(prisma.banner,token);return id?shape(await prisma.banner.delete({where:{id}})):null;},
 async setActive(token,isActive){const id=await resolve(prisma.banner,token);return id?shape(await prisma.banner.update({where:{id},data:{isActive},include})):null;},
 async reorder(tokens){return prisma.$transaction(async tx=>{for(let i=0;i<tokens.length;i++){const id=await resolve(tx.banner,tokens[i]);if(id)await tx.banner.update({where:{id},data:{displayOrder:i}});}return true;});},
};
