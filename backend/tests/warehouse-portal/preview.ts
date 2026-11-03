import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {fixture} from './fixture.js';
import {warehousePortalRoutes} from '../../src/modules/warehouse-portal/routes.js';

if(process.env.NODE_ENV==='production') throw new Error('QA preview must never run in production.');
const f=await fixture();const s=f.service;
const actor=(await s.login('singapore',{email:'admin@warehouse.test',password:f.password})).profile;
for(const [sku,name,pack] of [
  ['HC_10','Healthy Care Evening Primrose Oil 1000mg','200 viên'],
  ['BM_01','Blackmores Evening Primrose Oil','190 viên'],
  ['HC_002','Healthy Care Ginkgo Biloba 6000mg','60 viên'],
]) {
  const {id}=await s.createProduct(actor,{sku,name,packageSize:pack,unit:'Lọ'});
  const d=await s.create(actor,{requestId:`qa-${sku}`,type:'opening',documentDate:s.today(actor),counterparty:'DỮ LIỆU THỬ · Không phải tồn thật',lines:[{productId:id,batchCode:'QA-2026',expiryDate:'2029-12-31',quantity:sku==='HC_10'?120:sku==='BM_01'?60:24,unitCostMinor:250000}]});
  await s.commit(actor,d.id,{checked:true,confirmation:'SINGAPORE',revision:1});
}
const app=Fastify({logger:false});await app.register(rateLimit);await app.register(warehousePortalRoutes,{service:s,enabled:true});
await app.listen({host:'127.0.0.1',port:3088});
console.log('Disposable QA API: http://127.0.0.1:3088 · users admin@warehouse.test / duc@warehouse.test · password OnlyLocal-QA-2026!');
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{await app.close();await f.close();process.exit(0);});
