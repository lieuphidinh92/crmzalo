import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {importTotals} from '../../src/modules/warehouse-portal/import-totals.js';

test('import invoice, supplier and charges persist without changing draft stock or leaking cost',async()=>{
  const f=await fixture(),s=f.service;
  try{
    const sg=(await s.login('singapore',{email:'admin@warehouse.test',password:f.password})).profile;
    const vn=(await s.login('58nv1',{email:'admin@warehouse.test',password:f.password})).profile;
    const duc=(await s.login('singapore',{email:'duc@warehouse.test',password:f.password})).profile;
    const supplier=await s.createSupplier(sg,{name:'Singapore supplier',phone:'123'});
    assert.equal((await s.createSupplier(sg,{name:'singapore supplier'})).id,supplier.id);
    assert.equal((await s.suppliers(vn)).length,0);await assert.rejects(s.suppliers(duc),{statusCode:403});
    await assert.rejects(s.createSupplier(duc,{name:'No access'}),{statusCode:403});
    const p=(await s.createProduct(sg,{sku:'IMP',name:'Import QA',packageSize:'60 viên',unit:'Lọ'})).id;
    const body={requestId:randomUUID(),type:'import',currency:'SGD',exchangeRate:19000,documentDate:s.today(sg),counterparty:'Supplier snapshot',
      importDetails:{supplierId:supplier.id,invoiceNo:'INV-SG-001',shippingMinor:500,discountType:'percent',discountValue:10,vatRate:9,depositMinor:1000,grandTotalMinor:1},
      lines:[{productId:p,quantity:3,batchCode:'SG-01',expiryDate:'2029-12-31',unitCostMinor:1250}]};
    const d=await s.create(sg,body);assert.equal((await s.batches(sg)).length,0);
    assert.equal((await s.create(sg,body)).id,d.id);
    const detail=await s.detail(sg,d.id),totals=detail.import_details;
    assert.equal(detail.counterparty,supplier.name);assert.equal(totals.goodsMinor,3750);assert.equal(totals.discountMinor,375);
    assert.equal(totals.vatMinor,304);assert.equal(totals.grandTotalMinor,4179);assert.equal(totals.balanceMinor,3179);assert.equal(totals.invoiceNo,'INV-SG-001');
    assert.equal((await s.list(sg))[0].import_details.grandTotalMinor,4179);
    assert.equal((await s.list(duc))[0].import_details,null);assert.equal((await s.list(duc))[0].goods_total_minor,null);
    assert.equal((await s.detail(duc,d.id)).import_details,undefined);
    const other=await s.createSupplier(vn,{name:'Vietnam supplier'});
    await assert.rejects(s.create(sg,{...body,requestId:randomUUID(),importDetails:{...body.importDetails,supplierId:other.id}}),/không thuộc/);
    await assert.rejects(s.create(sg,{...body,requestId:randomUUID(),importDetails:{...body.importDetails,depositMinor:999999}}),/Đặt cọc/);
    assert.equal((await s.list(sg)).length,1);
    await s.commit(sg,d.id,{confirmation:'SINGAPORE',checked:true,revision:1});
    const batch=(await s.batches(sg))[0];assert.equal(batch.current_quantity,3);assert.equal(Number(batch.import_cost),237500);
    await assert.rejects(s.commit(sg,d.id,{confirmation:'SINGAPORE',checked:true,revision:1}),{statusCode:409});
    const promoted=await s.setAccess(sg,{userId:'duc',role:'admin',seeCost:true,checked:true,confirmation:'SINGAPORE'});assert(promoted.updated);
    const next=(await s.login('singapore',{email:'duc@warehouse.test',password:f.password})).profile;
    assert.equal(next.role,'admin');assert.equal(next.seeCost,true);await s.create(next,{...body,requestId:randomUUID()});
    assert.equal((await s.login('58nv1',{email:'duc@warehouse.test',password:f.password})).profile.seeCost,false);
  }finally{await f.close();}
});
test('charge validation rejects forged, unsafe and negative totals; VND rounds once',()=>{
  assert.deepEqual(importTotals(101,{discountType:'percent',discountValue:12.5,vatRate:9}).grandTotalMinor,96);
  for(const raw of [{shippingMinor:-1},{depositMinor:500},{discountValue:102},{discountType:'x'},{discountType:'percent',discountValue:100.01},{discountType:'percent',discountValue:1.234},{vatRate:1.5}])assert.throws(()=>importTotals(101,raw));
  assert.throws(()=>importTotals(Number.MAX_SAFE_INTEGER,{}));
});
