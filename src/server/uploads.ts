import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {User} from '@prisma/client';
import {requireSeller} from './auth';
import {assert} from './errors';
import {db} from './db';
export async function uploadImage(req:Request,user:User,sellerId:string) {
  await requireSeller(user,sellerId);
  const max=5*1024*1024;
  const declared=Number(req.headers.get('content-length'));
  assert(Number.isFinite(declared)&&declared>0&&declared<=max+65536,413,'Максимум 5 МБ, нужен Content-Length');
  const reader=req.body?.getReader();assert(reader,400,'Нет файла');let total=0;const parts:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max+65536){await reader.cancel();assert(false,413,'Файл слишком большой');}parts.push(value);}
  const parsed=new Request('http://localhost',{method:'POST',headers:{'Content-Type':req.headers.get('content-type')||''},body:Buffer.concat(parts)});
  const file=(await parsed.formData()).get('file');
  assert(file instanceof File && file.size>0&&file.size<=max,400,'Загрузите изображение до 5 МБ');
  const bytes=Buffer.from(await file.arrayBuffer());
  const image=sharp(bytes,{limitInputPixels:25_000_000,animated:false});
  const meta=await image.metadata();
  assert(['jpeg','png','webp'].includes(meta.format||'')&&(meta.pages??1)===1,400,'Разрешены JPEG, PNG, WebP');
  const output=await image.rotate().resize({width:1600,height:2000,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  const {S3_BUCKET:bucket,S3_PUBLIC_URL:base,S3_ENDPOINT:endpoint,S3_REGION:region,S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey}=process.env;
  assert(bucket&&base&&base.startsWith('https://')&&accessKeyId&&secretAccessKey,503,'Объектное хранилище не настроено');
  const key=`products/${sellerId}/${randomUUID()}.jpg`;
  const client=new S3Client({region:region||'auto',endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:output,ContentType:'image/jpeg',CacheControl:'public, max-age=31536000, immutable'}));
  return db.productImage.create({data:{sellerId,objectKey:key,url:`${base.replace(/\/$/,'')}/${key}`}});
}
