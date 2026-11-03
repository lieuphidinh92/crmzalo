import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';

test('stock, date, money and session edge cases',async t=>{
  const f=await fixture();t.after(()=>f.close());const s=f.service;
  const login=await s.login('singapore',{email:'admin@warehouse.test',password:f.password}),a=login.profile;
  const v=(await s.login('58nv1',{email:'admin@warehouse.test',password:f.password})).profile;
  const p=(await s.createProduct(a,{sku:'QA',name:'QA Product',packageSize:'30 viên',unit:'Hộp'})).id;
  const confirm={checked:true,confirmation:'SINGAPORE',revision:1};
  const draft=(type:string,lines:any[],rest:any={})=>({requestId:randomUUID(),type,counterparty:'QA',documentDate:s.today(a),currency:'VND',exchangeRate:1,lines,...rest});
  const line={productId:p,batchCode:'LOT',expiryDate:'2029-12-31',manufactureDate:'2026-01-01',quantity:10,unitCostMinor:100000};

  await t.test('invalid dates, expired stock and fractional quantities do not write drafts',async()=>{
    await assert.rejects(s.create(a,draft('import',[line],{documentDate:'2026-13-40'})),{statusCode:400});
    await assert.rejects(s.create(a,draft('import',[{...line,expiryDate:'2020-01-01'}])),{statusCode:400});
    await assert.rejects(s.create(a,draft('import',[{...line,quantity:1.5}])),{statusCode:400});
    assert.equal((await s.list(a)).length,0);
  });
  await t.test('SGD cents and fixed FX convert to VND, lot merge weights by remaining stock',async()=>{
    const d=await s.create(a,draft('import',[{...line,unitCostMinor:1250}],{currency:'SGD',exchangeRate:20000}));
    await s.commit(a,d.id,confirm);
    let b=(await s.batches(a))[0];assert.equal(Number(b.import_cost),250000);
    const d2=await s.create(a,draft('import',[{...line,quantity:10,unitCostMinor:100000}]));await s.commit(a,d2.id,confirm);
    b=(await s.batches(a))[0];assert.equal(Number(b.import_cost),175000);assert.equal(b.current_quantity,20);
  });
  await t.test('two drafts cannot together overdraw a lot',async()=>{
    const b=(await s.batches(a))[0];
    const d1=await s.create(a,draft('export',[{productId:p,batchId:b.id,quantity:15}]));
    const d2=await s.create(a,draft('export',[{productId:p,batchId:b.id,quantity:15}]));
    const results=await Promise.allSettled([s.commit(a,d1.id,confirm),s.commit(a,d2.id,confirm)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await s.batches(a))[0].current_quantity,5);
  });
  await t.test('receiving merge rejects inconsistent lot expiry without consuming transit',async()=>{
    const dest=(await s.createProduct(v,{sku:'QA',name:'QA Product',packageSize:'30 viên',unit:'Hộp'})).id;
    const i=await s.create(v,draft('import',[{...line,productId:dest,expiryDate:'2028-12-31',quantity:1}]));await s.commit(v,i.id,{...confirm,confirmation:'58NV1'});
    const b=(await s.batches(a))[0];const d=await s.create(a,draft('transfer',[{productId:p,batchId:b.id,quantity:2}],{destination:'58nv1'}));await s.commit(a,d.id,confirm);
    const sent=await s.detail(v,d.id);
    await assert.rejects(s.receive(v,d.id,{checked:true,confirmation:'58NV1',revision:sent.revision,requestId:randomUUID(),note:'Đếm',lines:[{lineId:sent.lines[0].id,quantity:2}]}),{statusCode:409});
    assert.equal((await s.detail(v,d.id)).lines[0].received,0);assert.equal((await s.batches(v))[0].current_quantity,1);
  });
  await t.test('a stocktake adjustment posts a signed movement and balances report',async()=>{
    const b=(await s.batches(a))[0];const d=await s.create(a,draft('stocktake',[{productId:p,batchId:b.id,quantity:1,expectedQuantity:b.current_quantity}]));await s.commit(a,d.id,confirm);
    assert.equal((await s.batches(a))[0].current_quantity,1);
    const r=(await s.report(a,s.today(a),s.today(a)))[0];assert.equal(r.opening+r.incoming-r.outgoing+r.adjustment,r.closing);assert.equal(r.closing,1);
  });
  await t.test('access changes revoke only that warehouse session and never grant the other warehouse',async()=>{
    const sgUser=await s.login('singapore',{email:'duc@warehouse.test',password:f.password});
    const vnUser=await s.login('58nv1',{email:'duc@warehouse.test',password:f.password});
    await assert.rejects(s.setAccess(sgUser.profile,{userId:'viewer',role:'admin',seeCost:true,...confirm}),{statusCode:403});
    await s.setAccess(a,{userId:'duc',role:'viewer',seeCost:false,...confirm});
    await assert.rejects(s.authenticate('singapore',sgUser.token),{statusCode:401});
    assert.equal((await s.authenticate('58nv1',vnUser.token)).role,'operator');
    assert.equal((await s.login('singapore',{email:'duc@warehouse.test',password:f.password})).profile.role,'viewer');
  });
  await t.test('report refuses pre-activation dates; changed lot expiry invalidates an old draft',async()=>{
    await assert.rejects(s.report(a,'2000-01-01',s.today(a)),{statusCode:400});
    const b=(await s.batches(a))[0];const d=await s.create(a,draft('export',[{productId:p,batchId:b.id,quantity:1}]));
    await f.db.query("UPDATE inventory_batches SET expiry_date='2028-12-31' WHERE id=$1",[b.id]);
    await assert.rejects(s.commit(a,d.id,confirm),{statusCode:409});assert.equal((await s.batches(a))[0].current_quantity,b.current_quantity);
  });
  await t.test('logout, expiry and inactive user revoke server-side access',async()=>{
    await s.logout(login.token);await assert.rejects(s.authenticate('singapore',login.token),{statusCode:401});
    const other=await s.login('singapore',{email:'admin@warehouse.test',password:f.password});
    await f.db.query("UPDATE wp_sessions SET expires_at=now()-interval '1 second' WHERE user_id='admin' AND warehouse_code='singapore'");
    await assert.rejects(s.authenticate('singapore',other.token),{statusCode:401});
    const next=await s.login('singapore',{email:'admin@warehouse.test',password:f.password});await f.db.query("UPDATE users SET is_active=false WHERE id='admin'");
    await assert.rejects(s.authenticate('singapore',next.token),{statusCode:401});
  });
});
