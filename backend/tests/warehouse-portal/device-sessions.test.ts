import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {fixture} from './fixture.js';
import {warehousePortalRoutes} from '../../src/modules/warehouse-portal/routes.js';

test('one browser can operate one warehouse, independently of account and other browsers',async()=>{
  const f=await fixture(),app=Fastify();
  await app.register(warehousePortalRoutes,{enabled:true,service:f.service});
  const login=(warehouse:string,email:string,cookie='',password=f.password)=>app.inject({method:'POST',url:`/api/warehouse/v1/${warehouse}/login`,headers:{cookie,origin:`https://${warehouse==='singapore'?'sing':'sale'}.halo.com.vn`},payload:{email,password}});
  const profile=(warehouse:string,token:string,cookie='')=>app.inject({url:`/api/warehouse/v1/${warehouse}/profile`,headers:{cookie,authorization:`Bearer ${token}`}});
  const cookies=(r:any)=>[r.headers['set-cookie']].flat().map((s:string)=>s.split(';')[0]).join('; ');
  try{
    const sg=await login('singapore','duc@warehouse.test');assert.equal(sg.statusCode,200);
    const device=cookies(sg),token=sg.json().token;
    assert.match(String(sg.headers['set-cookie']),/HttpOnly/);assert.match(String(sg.headers['set-cookie']),/Domain=halo.com.vn/);
    assert.equal((await profile('singapore',token,device)).statusCode,200);
    assert.equal((await profile('singapore',token)).statusCode,401);
    const failed=await login('58nv1','admin@warehouse.test',device,'wrong');assert.equal(failed.statusCode,401);
    assert.equal((await profile('singapore',token,device)).statusCode,200);
    const otherBrowser=await login('singapore','duc@warehouse.test');
    const vn=await login('58nv1','admin@warehouse.test',device);assert.equal(vn.statusCode,200);
    assert.equal((await profile('singapore',token,device)).statusCode,401);
    assert.equal((await profile('singapore',otherBrowser.json().token,cookies(otherBrowser))).statusCode,200);
    assert.equal((await profile('58nv1',vn.json().token,cookies(vn))).statusCode,200);
    assert.equal((await profile('58nv1',vn.json().token,cookies(otherBrowser))).statusCode,401);
    const back=await login('singapore','duc@warehouse.test',cookies(vn));assert.equal(back.statusCode,200);
    assert.equal((await profile('58nv1',vn.json().token,cookies(vn))).statusCode,401);
    assert.equal((await profile('singapore',back.json().token,cookies(back))).statusCode,200);
  }finally{await app.close();await f.close();}
});
