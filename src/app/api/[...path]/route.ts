import {z} from 'zod';
import {db} from '@/server/db';
import {body,checkOrigin,handle,rateLimit} from '@/server/http';
import {currentUser,createSession,devLogin,requireSeller,requireUser,telegramLogin,digest} from '@/server/auth';
import {developmentEnabled} from '@/server/config';
import {catalog,publicProduct} from '@/server/catalog';
import {addVariant,applySeller,saveProduct,sellerDashboard,setInventory,updateSeller} from '@/server/sellers';
import {uploadImage} from '@/server/uploads';
import {AppError} from '@/server/errors';
import {cookies} from 'next/headers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function route(req:Request,{params}:{params:Promise<{path:string[]}>}) {
  return handle(async()=>{
    checkOrigin(req);const p=(await params).path;const method=req.method;const url=new URL(req.url);
    if(method==='GET'&&p[0]==='catalog') return catalog(url.searchParams);
    if(method==='GET'&&p[0]==='products'&&p.length===2) return publicProduct(p[1]);
    if(method==='GET'&&p[0]==='categories') return db.category.findMany({orderBy:{name:'asc'}});
    if(method==='GET'&&p[0]==='stores') return db.seller.findMany({where:{status:'ACTIVE'},select:{id:true,name:true,slug:true,description:true,city:true}});
    if(method==='GET'&&p[0]==='session') {
      const user=await currentUser();return {user,memberships:user?await db.sellerMembership.findMany({where:{userId:user.id},include:{seller:true}}):[],development:developmentEnabled()};
    }
    if(method==='GET'&&p[0]==='dev-users'&&developmentEnabled()) return db.user.findMany({where:{telegramId:{lt:0}},select:{id:true,displayName:true,role:true}});
    if(method==='POST'&&p[0]==='auth') {
      await rateLimit(`auth:global`,200);
      await rateLimit(`auth:${req.headers.get('x-forwarded-for')?.split(',')[0]||'local'}`,20);
      const input=await body(req);
      const user=p[1]==='telegram'?await telegramLogin(z.object({initData:z.string()}).strict().parse(input).initData):p[1]==='dev'?await devLogin(z.object({id:z.string()}).strict().parse(input).id):null;
      if(!user) throw new AppError(404,'Не найдено');await createSession(user);return {user};
    }
    const user=await requireUser();
    if(method!=='GET') await rateLimit(`write:${user.id}`,60);
    if(method==='POST'&&p[0]==='logout') {
      const token=(await cookies()).get('wearo_session')?.value;
      if(token) await db.session.deleteMany({where:{tokenHash:digest(token)}});
      (await cookies()).delete('wearo_session');return {ok:true};
    }
    if(p[0]==='seller-applications'&&method==='POST') return applySeller(user,await body(req));
    if(p[0]==='sellers'&&p.length>=2){
      const sellerId=p[1];
      if(p.length===2&&method==='GET')return sellerDashboard(user,sellerId);
      if(p.length===2&&method==='PATCH')return updateSeller(user,sellerId,await body(req));
      if(p[2]==='images'&&method==='POST')return uploadImage(req,user,sellerId);
      if(p[2]==='products'&&method==='POST'&&p.length===3)return saveProduct(user,sellerId,await body(req));
      if(p[2]==='products'&&method==='PATCH'&&p.length===4)return saveProduct(user,sellerId,await body(req),p[3]);
      if(p[2]==='products'&&p[4]==='variants'&&method==='POST')return addVariant(user,sellerId,p[3],await body(req));
      if(p[2]==='inventory'&&method==='PATCH'){const input=z.object({available:z.number().int()}).strict().parse(await body(req));return setInventory(user,sellerId,p[3],input.available);}
      await requireSeller(user,sellerId);
    }
    if(p[0]==='favorites') {
      if(method==='GET')return db.favorite.findMany({where:{userId:user.id,product:{status:'APPROVED',seller:{status:'ACTIVE'}}},include:{product:{include:{images:true,seller:{select:{name:true}}}}}});
      if(method==='POST') {await publicProduct(p[1]);return db.favorite.upsert({where:{userId_productId:{userId:user.id,productId:p[1]}},create:{userId:user.id,productId:p[1]},update:{}});}
      if(method==='DELETE')return db.favorite.deleteMany({where:{userId:user.id,productId:p[1]}});
    }
    throw new AppError(404,'Не найдено');
  });
}
export {route as GET,route as POST,route as PATCH,route as DELETE};
