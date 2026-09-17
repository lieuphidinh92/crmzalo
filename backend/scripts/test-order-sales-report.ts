/** Read-only integration verification; no seeds or database mutations. */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/shared/database/prisma-client.js';
import { orderSalesRoutes, parseOrderSalesQuery } from '../src/modules/reports/order-sales-routes.js';
import { orderScopeWhere, toNumber } from '../src/modules/orders/order-service.js';
const bounds = parseOrderSalesQuery({from:'2026-09-17',to:'2026-09-17'});
assert.equal(bounds.from.toISOString(),'2026-09-16T17:00:00.000Z');
assert.equal(bounds.until.toISOString(),'2026-09-17T17:00:00.000Z');
assert.throws(()=>parseOrderSalesQuery({from:'2026-02-29',to:'2026-03-01'}));
assert.throws(()=>parseOrderSalesQuery({from:'2026-09-18',to:'2026-09-17'}));
const app=Fastify();
await app.register(jwt,{secret:'read-only-local-test-secret'});
await app.register(orderSalesRoutes);
try {
  const owner=await prisma.user.findFirstOrThrow({where:{role:{in:['owner','admin']}},select:{id:true,orgId:true,role:true}});
  const member=await prisma.user.findFirst({where:{orgId:owner.orgId,role:'member'},select:{id:true,orgId:true,role:true}});
  const users=[{id:owner.id,orgId:owner.orgId,role:owner.role},{id:owner.id,orgId:owner.orgId,role:'member',canViewAllOrders:true},...(member?[{id:member.id,orgId:member.orgId,role:'member'}]:[])];
  const req=(user:any,query='')=>app.inject({url:'/api/v1/reports/order-sales?from=2020-01-01&to=2030-12-31'+query,headers:{authorization:'Bearer '+app.jwt.sign(user)}});
  assert.equal((await app.inject({url:'/api/v1/reports/order-sales'})).statusCode,401);
  for(const user of users){
    const response=await req(user,'&limit=1&status='); assert.equal(response.statusCode,200,response.body);
    const data=response.json();
    const orders=await prisma.order.findMany({where:{AND:[orderScopeWhere(user),{status:{in:['confirmed','packing','shipping','shipped','completed','paid']}},{OR:[{orderDate:{gte:new Date('2020-01-01T00:00:00+07:00'),lt:new Date('2031-01-01T00:00:00+07:00')}},{orderDate:null,createdAt:{gte:new Date('2020-01-01T00:00:00+07:00'),lt:new Date('2031-01-01T00:00:00+07:00')}}]}]},select:{id:true,totalAmount:true,totalAmountValue:true,paidAmount:true,debtAmountValue:true,assignedSaleId:true}});
    const expected=orders.reduce((a,o)=>({orderCount:a.orderCount+1,revenue:a.revenue+toNumber(o.totalAmountValue??o.totalAmount),paid:a.paid+toNumber(o.paidAmount),debt:a.debt+toNumber(o.debtAmountValue)}),{orderCount:0,revenue:0,paid:0,debt:0});
    assert.deepEqual((await req(user,'&reconciled=')).json().summary,expected);
    const unassigned=(await req(user,'&saleId=unassigned')).json();
    assert.equal(unassigned.total,orders.filter(o=>o.assignedSaleId===null).length);
    const otherSale=(await req(user,'&saleId='+owner.id)).json();
    assert.equal(otherSale.total,orders.filter(o=>o.assignedSaleId===owner.id).length);
    if(data.rows[0]) { const searched=(await req(user,'&search='+encodeURIComponent(data.rows[0].orderCode))).json(); assert.ok(searched.rows.some((o:any)=>o.id===data.rows[0].id)); }
    assert.deepEqual(data.summary,expected); assert.equal(data.total,orders.length); assert.ok(data.rows.length<=1);
    assert.equal(data.bySale.reduce((s:number,o:any)=>s+o.revenue,0),expected.revenue);
    assert.deepEqual((await req(user,'&page=2&limit=1')).json().summary,expected);
    assert.deepEqual((await req(user,'&status=all')).json().summary,expected);
    assert.deepEqual((await req(user,'&status=draft')).json().summary,{orderCount:0,revenue:0,paid:0,debt:0});
    for(const row of data.rows){assert.equal(typeof row.totalAmountValue,'number');assert.equal(typeof row.vatIssuedAmount,'number');assert.ok(!JSON.stringify(row).match(/cost|profit/i));assert.ok(orders.some(o=>o.id===row.id));}
    for(const sale of data.bySale.slice(0,2)){const filtered=(await req(user,'&saleId='+encodeURIComponent(sale.saleId??'unassigned'))).json();assert.equal(filtered.summary.revenue,sale.revenue);assert.equal(filtered.summary.orderCount,sale.orderCount);}
  }
  const narrowFrom = new Date('2026-08-01T00:00:00+07:00'), narrowUntil = new Date('2026-09-01T00:00:00+07:00');
  const independent = await prisma.$queryRaw<Array<{count:bigint,revenue:unknown}>>`
    SELECT COUNT(*) AS count, COALESCE(SUM(COALESCE(total_amount_value, total_amount)),0) AS revenue
    FROM orders WHERE org_id=${owner.orgId} AND status IN ('confirmed','packing','shipping','shipped','completed','paid')
    AND COALESCE(order_date,created_at)>=${narrowFrom} AND COALESCE(order_date,created_at)<${narrowUntil}`;
  const narrow=(await app.inject({url:'/api/v1/reports/order-sales?from=2026-08-01&to=2026-08-31',headers:{authorization:'Bearer '+app.jwt.sign(users[0])}})).json();
  assert.equal(narrow.total,Number(independent[0].count));assert.equal(narrow.summary.revenue,toNumber(independent[0].revenue));
  const nullDates=await prisma.order.count({where:{orgId:owner.orgId,orderDate:null,status:{not:'opening_balance'}}});
  console.log('Local relevant orders with null business date:',nullDates);
  const empty=(await req({...users[0],orgId:'no-such-org'},'&status=all')).json(); assert.equal(empty.total,0);assert.deepEqual(empty.saleOptions,[]);
  assert.equal((await req(users[0],'&limit=999')).json().limit,100);
  for(const query of ['&status=unknown','&reconciled=unknown','&page=1.5']) assert.equal((await req(users[0],query)).statusCode,400);
  console.log('PASS: VN day boundaries, invalid dates, auth, org/member/accounting scopes, full-set totals, employee attribution, pagination, status exclusions and numeric safe fields. No DB writes.');
} finally {await app.close();await prisma.$disconnect();}
