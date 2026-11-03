import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {fixture} from './fixture.js';
import {warehousePortalRoutes} from '../../src/modules/warehouse-portal/routes.js';

test('warehouse isolation and physical two-way transfer lifecycle',async t=>{
  const f=await fixture();t.after(()=>f.close());const {service:s,db}=f;
  const app=Fastify();await app.register(rateLimit);await app.register(warehousePortalRoutes,{service:s,enabled:true});t.after(()=>app.close());
  const apiLogin=await app.inject({method:'POST',url:'/api/warehouse/v1/singapore/login',payload:{email:'admin@warehouse.test',password:f.password}});
  const sgCookie=[apiLogin.headers['set-cookie']].flat().map((s:any)=>s.split(';')[0]).join('; ');
  const sgLogin=apiLogin.json();
  const vnLogin=await s.login('58nv1',{email:'admin@warehouse.test',password:f.password});
  const sg=sgLogin.profile,vn=vnLogin.profile;
  const duc=(await s.login('singapore',{email:'duc@warehouse.test',password:f.password})).profile;
  const viewer=(await s.login('singapore',{email:'viewer@warehouse.test',password:f.password})).profile;
  const confirmation=(a:any,revision=1)=>({confirmation:a.warehouse==='singapore'?'SINGAPORE':'58NV1',checked:true,revision});
  const day=s.today(sg);const expiry='2029-12-31';
  const stock=async(a:any,id:string)=>(await db.query("SELECT COALESCE(sum(current_quantity),0)::int stock FROM inventory_batches WHERE product_id=$1 AND warehouse_id=$2 AND status='active'",[id,a.warehouseId])).rows[0].stock;
  const create=async(a:any,type:string,lines:any[],extra:any={})=>s.create(a,{requestId:randomUUID(),type,documentDate:day,counterparty:'Kiểm đếm QA',currency:'VND',exchangeRate:1,lines,...extra});
  const p=(await s.createProduct(sg,{sku:'HC_10',name:'Healthy Care Evening Primrose Oil',packageSize:'200 viên',unit:'Lọ'})).id;
  let openingId='';let transferId='';let destProduct='';

  await t.test('CRM JWT and source session cannot authorize destination endpoints',async()=>{
    for(const token of ['fake.crm.jwt',sgLogin.token]) {
      const r=await app.inject({method:'GET',url:'/api/warehouse/v1/58nv1/products',headers:{authorization:`Bearer ${token}`}});assert.equal(r.statusCode,401);
    }
    assert.equal((await app.inject({method:'GET',url:'/api/warehouse/v1/singapore/products',headers:{authorization:`Bearer ${sgLogin.token}`,cookie:sgCookie}})).statusCode,200);
  });
  await t.test('viewer cannot write, wrong-org product cannot be imported',async()=>{
    await assert.rejects(s.createProduct(viewer,{sku:'XX',name:'Test',packageSize:'1',unit:'Hộp'}),{statusCode:403});
    await assert.rejects(create(vn,'import',[{productId:p,batchCode:'L1',quantity:1,unitCostMinor:100}]),/không thuộc/);
  });
  await t.test('draft does not change stock; multiple opening lots commit atomically',async()=>{
    const d=await create(sg,'opening',[{productId:p,batchCode:'L1',expiryDate:expiry,quantity:100,unitCostMinor:100000},{productId:p,batchCode:'L2',expiryDate:expiry,quantity:20,unitCostMinor:110000}]);openingId=d.id;
    assert.equal(await stock(sg,p),0);
    await s.commit(sg,d.id,confirmation(sg));assert.equal(await stock(sg,p),120);
    await assert.rejects(s.commit(sg,d.id,confirmation(sg)),{statusCode:409});assert.equal(await stock(sg,p),120);
  });
  await t.test('wrong confirmation and unchecked bypass are rejected',async()=>{
    const b=(await s.batches(sg))[0];const d=await create(sg,'export',[{productId:p,batchId:b.id,quantity:1}]);
    await assert.rejects(s.commit(sg,d.id,{...confirmation(sg),confirmation:'58NV1'}));
    await assert.rejects(s.commit(sg,d.id,{...confirmation(sg),checked:false}));
    await s.cancel(sg,d.id,{...confirmation(sg),note:'Bản nháp thử'});
  });
  await t.test('idempotent draft preserves stock and rejects changed retry',async()=>{
    const body={requestId:randomUUID(),type:'export',documentDate:day,counterparty:'QA',lines:[{productId:p,batchId:(await s.batches(sg))[0].id,quantity:1}]};
    const a=await s.create(sg,body),b=await s.create(sg,body);assert.equal(a.id,b.id);
    await assert.rejects(s.create(sg,{...body,counterparty:'Khác'}),{statusCode:409});
  });
  await t.test('dispatch deducts only source, destination has no stock until receipt',async()=>{
    const b=(await s.batches(sg)).find((b:any)=>b.batch_code==='L1');
    const d=await create(sg,'transfer',[{productId:p,batchId:b.id,quantity:30}],{destination:'58nv1'});transferId=d.id;
    await assert.rejects(s.detail(vn,d.id),{statusCode:404});
    await s.commit(sg,d.id,confirmation(sg));assert.equal(await stock(sg,p),90);
    const details=await s.detail(vn,d.id);destProduct=details.lines[0].destination_product_id;
    assert.equal(await stock(vn,destProduct),0);assert.equal(details.status,'dispatched');
  });
  await t.test('source cannot receive; destination can receive a partial quantity with retries safe',async()=>{
    const d=await s.detail(vn,transferId);
    const body={...confirmation(vn,d.revision),requestId:randomUUID(),note:'Đã đếm thực tế 28 lọ',lines:[{lineId:d.lines[0].id,quantity:28}]};
    await assert.rejects(s.receive(sg,d.id,{...body,...confirmation(sg,d.revision)}),{statusCode:403});
    await s.receive(vn,d.id,body);await s.receive(vn,d.id,body);
    assert.equal(await stock(vn,destProduct),28);assert.equal((await s.detail(vn,d.id)).status,'partial');
    await assert.rejects(s.receive(vn,d.id,{...body,requestId:randomUUID()}),{statusCode:409});
  });
  await t.test('over-receipt rejected; explicit loss reconciliation closes only remaining transit',async()=>{
    const d=await s.detail(vn,transferId);const body={...confirmation(vn,d.revision),requestId:randomUUID(),note:'Thiếu 2 lọ, đã đối soát',lines:[{lineId:d.lines[0].id,quantity:3}]};
    await assert.rejects(s.receive(vn,d.id,body),{statusCode:409});
    await s.receive(vn,d.id,{...body,lines:[{lineId:d.lines[0].id,quantity:2}]},true);
    const final=await s.detail(vn,d.id);assert.equal(final.status,'completed');assert.equal(final.lines[0].reconciled,2);assert.equal(await stock(vn,destProduct),28);
  });
  await t.test('reverse 58NV1 → Singapore preserves lot and both stocks',async()=>{
    const b=(await s.batches(vn))[0];const d=await create(vn,'transfer',[{productId:destProduct,batchId:b.id,quantity:5}],{destination:'singapore'});
    await s.commit(vn,d.id,confirmation(vn));assert.equal(await stock(vn,destProduct),23);
    const sent=await s.detail(sg,d.id);await s.receive(sg,d.id,{...confirmation(sg,sent.revision),requestId:randomUUID(),note:'Đếm đủ 5',lines:[{lineId:sent.lines[0].id,quantity:5}]});
    assert.equal(await stock(sg,p),95);assert.equal(new Date((await s.batches(sg)).find((b:any)=>b.batch_code==='L1').expiry_date).toISOString().slice(0,10),expiry);
  });
  await t.test('all-or-nothing export rolls back first line when second is short',async()=>{
    const bs=await s.batches(sg);const before=await stock(sg,p);
    const d=await create(sg,'export',[{productId:p,batchId:bs[0].id,quantity:1},{productId:p,batchId:bs[1].id,quantity:999}]);
    await assert.rejects(s.commit(sg,d.id,confirmation(sg)),{statusCode:409});assert.equal(await stock(sg,p),before);assert.equal((await s.detail(sg,d.id)).status,'draft');
  });
  await t.test('stocktake refuses stale count after warehouse activity',async()=>{
    const b=(await s.batches(sg))[0];
    const count=await create(sg,'stocktake',[{productId:p,batchId:b.id,quantity:b.current_quantity-1,expectedQuantity:b.current_quantity}]);
    const out=await create(sg,'export',[{productId:p,batchId:b.id,quantity:1}]);await s.commit(sg,out.id,confirmation(sg));
    await assert.rejects(s.commit(sg,count.id,confirmation(sg)),{statusCode:409});
  });
  await t.test('prices hidden throughout documents and stock API for warehouse operator',async()=>{
    const d=await s.detail(duc,openingId);assert.equal(d.exchange_rate,undefined);assert(d.lines.every((l:any)=>l.cost_vnd===undefined&&l.unit_cost_minor===undefined));
    assert((await s.batches(duc)).every((b:any)=>b.import_cost===undefined));
  });
  await t.test('revoked grant immediately invalidates previously issued warehouse session',async()=>{
    const login=await s.login('singapore',{email:'viewer@warehouse.test',password:f.password});await db.query("DELETE FROM wp_access WHERE warehouse_code='singapore' AND user_id='viewer'");
    await assert.rejects(s.authenticate('singapore',login.token),{statusCode:401});
  });
  await t.test('reports balance and global stock matches actual batches',async()=>{
    const r=(await s.report(sg,day,day)).find((r:any)=>r.sku==='HC_10');
    assert.equal(r.opening+r.incoming-r.outgoing+r.adjustment,r.closing);assert.equal(r.closing,await stock(sg,p));
    const mismatch=await db.query('SELECT p.id FROM products p WHERE p.total_stock<>(SELECT COALESCE(sum(b.current_quantity),0) FROM inventory_batches b WHERE b.product_id=p.id AND status=\'active\')');assert.equal(mismatch.rows.length,0);
  });
});
