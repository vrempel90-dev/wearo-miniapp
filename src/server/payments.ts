import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {User} from '@prisma/client';
import {z} from 'zod';
import {transaction} from './db';
import {assert,AppError} from './errors';
import {testPaymentsEnabled} from './config';
export type VerifiedPaymentEvent={eventId:string;orderId:string;amountMinor:number;currency:'KZT';status:'TEST_SUCCEEDED'|'PAID';provider:string};
export interface PaymentProvider {
  readonly name:string;
  createIntent(orderId:string,amountMinor:number):Promise<{reference:string}>;
  verifyEvent(payload:string,signature:string):VerifiedPaymentEvent;
  refund(reference:string,amountMinor:number,key:string):Promise<{reference:string}>;
}
export class DisabledPaymentProvider implements PaymentProvider {
  name='DISABLED';
  async createIntent():Promise<{reference:string}>{throw new AppError(503,'Реальный приём денег не подключён');}
  verifyEvent():VerifiedPaymentEvent{throw new AppError(503,'Платёжный провайдер не подключён');}
  async refund():Promise<{reference:string}>{throw new AppError(503,'Провайдер возвратов не подключён');}
}
const eventSchema=z.object({eventId:z.string(),orderId:z.string(),amountMinor:z.number().int().positive(),currency:z.literal('KZT'),status:z.literal('TEST_SUCCEEDED'),provider:z.literal('TEST')}).strict();
export class TestPaymentProvider implements PaymentProvider {
  name='TEST';private secret=randomBytes(32);
  async createIntent(orderId:string):Promise<{reference:string}>{assert(testPaymentsEnabled(),404,'Недоступно');return {reference:`test:${orderId}`};}
  issue(event:VerifiedPaymentEvent){const payload=JSON.stringify(event);return {payload,signature:createHmac('sha256',this.secret).update(payload).digest('hex')};}
  verifyEvent(payload:string,signature:string):VerifiedPaymentEvent{
    assert(testPaymentsEnabled()&&/^[a-f0-9]{64}$/.test(signature),401,'Платёжное событие не подтверждено');
    assert(timingSafeEqual(Buffer.from(signature,'hex'),createHmac('sha256',this.secret).update(payload).digest()),401,'Подпись платежа не подтверждена');
    return eventSchema.parse(JSON.parse(payload));
  }
  async refund(reference:string,_amountMinor:number,key:string){assert(testPaymentsEnabled(),404,'Недоступно');return {reference:`test-refund:${reference}:${key}`};}
}
const testProvider=new TestPaymentProvider();
export async function testPayment(user:User,orderId:string,input:unknown){
  assert(testPaymentsEnabled(),404,'Недоступно');const {eventId}=z.object({eventId:z.string().uuid()}).strict().parse(input);
  return transaction(async tx=>{
    const order=await tx.order.findFirst({where:{id:orderId,buyerId:user.id,isTest:true},include:{payment:true}});
    assert(order&&order.payment&&order.payment.provider==='TEST',404,'Тестовый заказ не найден');
    const payment=order.payment;
    const signed=testProvider.issue({eventId:`test:${eventId}`,orderId,amountMinor:order.totalMinor,currency:'KZT',status:'TEST_SUCCEEDED',provider:'TEST'});
    const event=testProvider.verifyEvent(signed.payload,signed.signature);
    assert(event.amountMinor===payment.amountMinor&&event.orderId===order.id&&event.currency==='KZT',409,'Параметры платежа не совпадают');
    const old=await tx.paymentEvent.findUnique({where:{eventId:event.eventId}});
    if(old){assert(old.paymentId===payment.id,409,'Событие относится к другому платежу');return payment;}
    assert(order.status==='PENDING',409,'Заказ больше не ожидает оплату');
    assert(['PENDING','TEST_SUCCEEDED'].includes(payment.status),409,'Платёж завершён');
    await tx.paymentEvent.create({data:{paymentId:payment.id,eventId:event.eventId,type:payment.status==='TEST_SUCCEEDED'?'DUPLICATE':'TEST_SUCCEEDED'}});
    const result=await tx.payment.update({where:{id:payment.id},data:{status:'TEST_SUCCEEDED',externalId:`test:${orderId}`}});
    await tx.auditLog.create({data:{actorId:user.id,action:'TEST_PAYMENT_CONFIRMED',entityId:payment.id}});return result;
  });
}
