import {User} from '@prisma/client';
import {z} from 'zod';
import {transaction} from './db';
import {requireAdmin} from './auth';
import {assert} from './errors';
import {validateTransition} from './order-rules';
import {testPaymentsEnabled} from './config';
export async function requestReturn(user:User,orderId:string,input:unknown){
  const {reason}=z.object({reason:z.string().trim().min(10).max(2000)}).strict().parse(input);
  return transaction(async tx=>{
    const order=await tx.order.findFirst({where:{id:orderId,buyerId:user.id},include:{returnRequest:true}});assert(order,404,'Заказ не найден');
    if(order.returnRequest){assert(order.returnRequest.reason===reason,409,'Обращение уже создано');return order.returnRequest;}
    validateTransition(order.status,'RETURN_REQUESTED','BUYER');
    const result=await tx.returnRequest.create({data:{orderId,buyerId:user.id,reason}});
    await tx.order.update({where:{id:orderId},data:{status:'RETURN_REQUESTED'}});
    await tx.orderStatusHistory.create({data:{orderId,fromStatus:order.status,toStatus:'RETURN_REQUESTED',actorId:user.id}});
    await tx.auditLog.create({data:{actorId:user.id,action:'RETURN_REQUESTED',entityId:orderId}});return result;
  });
}
export async function reviewReturn(user:User,returnId:string,input:unknown){
  requireAdmin(user);const data=z.object({status:z.enum(['APPROVED','REJECTED','RECEIVED']),note:z.string().max(1000).default('')}).strict().parse(input);
  return transaction(async tx=>{
    const r=await tx.returnRequest.findUnique({where:{id:returnId},include:{order:{include:{items:true,payment:true}}}});assert(r,404,'Возврат не найден');
    if(r.status===data.status)return r;
    assert((r.status==='REQUESTED'&&['APPROVED','REJECTED'].includes(data.status))||(r.status==='APPROVED'&&data.status==='RECEIVED'),409,'Недопустимое решение по возврату');
    assert(r.order.status==='RETURN_REQUESTED',409,'Статус заказа изменился');
    if(data.status==='RECEIVED'){
      assert(r.order.isTest&&testPaymentsEnabled()&&r.order.payment?.status==='TEST_SUCCEEDED',503,'Для реального возврата нужен подключённый платёжный провайдер');
      validateTransition(r.order.status,'RETURNED','ADMIN');
      for(const i of r.order.items)await tx.inventory.update({where:{variantId:i.variantId},data:{available:{increment:i.quantity}}});
      await tx.payment.update({where:{orderId:r.orderId},data:{status:'TEST_REFUNDED'}});
      await tx.paymentEvent.create({data:{paymentId:r.order.payment.id,eventId:`return:${r.id}`,type:'TEST_REFUNDED'}});
      await tx.commission.update({where:{orderId:r.orderId},data:{payableMinor:0,reversedAt:new Date()}});
    }
    if(data.status!=='APPROVED'){
      const status=data.status==='RECEIVED'?'RETURNED':'DELIVERED';
      await tx.order.update({where:{id:r.orderId},data:{status}});
      await tx.orderStatusHistory.create({data:{orderId:r.orderId,fromStatus:'RETURN_REQUESTED',toStatus:status,actorId:user.id}});
    }
    const result=await tx.returnRequest.update({where:{id:returnId},data:{status:data.status,reviewNote:data.note}});
    await tx.auditLog.create({data:{actorId:user.id,action:'RETURN_REVIEWED',entityId:returnId,details:{status:data.status,note:data.note}}});return result;
  });
}
