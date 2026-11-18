import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

// Isolated route fixture: no environment, real users, JWTs or database connections.
let account:any={role:'member',oversell_until:null};
let stock=0;
let writeAttempts=0;
(globalThis as any).prisma={
  contact:{findFirst:async()=>({id:'contact-fixture',assignedUserId:'member-fixture'})},
  product:{findMany:async()=>[{id:'product-fixture',name:'Fixture product',totalStock:stock,sellable:true,unit:'hộp'}]},
  $queryRaw:async()=>account?[account]:[],
  $transaction:async()=>{writeAttempts++;throw new Error('Fixture must not mutate');},
};
const {saleAppRoutes}=await import('../src/modules/sale-app/sale-app-routes.js');
const app=Fastify();
app.decorateRequest('jwtVerify',async function(this:any){
  this.user={id:'member-fixture',orgId:'org-fixture',role:'member',email:'fixture@example.test',oversellUntil:'2099-01-01'};
});
await app.register(saleAppRoutes);

test('API uses a current expiring grant and preserves stock checks for ordinary members',async()=>{
  try {
    const cases=[
      {name:'ordinary overstock',account:{role:'member',oversell_until:null},stock:0,status:403},
      {name:'ordinary within stock',account:{role:'member',oversell_until:null},stock:1,status:400},
      {name:'active temporary grant',account:{role:'member',oversell_until:new Date(Date.now()+60000)},stock:0,status:400},
      {name:'expired grant with forged long-lived JWT claim',account:{role:'member',oversell_until:new Date(0)},stock:0,status:403},
      {name:'inactive account',account:null,stock:0,status:403},
      {name:'existing manager',account:{role:'admin',oversell_until:null},stock:0,status:400},
    ];
    for(const item of cases) {
      account=item.account;stock=item.stock;
      const response=await app.inject({method:'POST',url:'/api/v1/sale-app/orders',payload:{contactId:'contact-fixture',status:'confirmed',paymentMethod:'cash',items:[{productId:'product-fixture',quantity:1,unitPrice:100},{productId:'missing-product-fixture',quantity:1,unitPrice:100}]}});
      assert.equal(response.statusCode,item.status,item.name);
      if(item.status===400) assert.match(response.json().error,/missing-product-fixture/,item.name);
      else assert.match(response.json().error,/chỉ còn/,item.name);
    }
    assert.equal(writeAttempts,0);
  } finally {await app.close();}
});
