/** Isolated HTTP permission tests. Prisma methods are stubbed; no DB connection or writes. */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/shared/database/prisma-client.js';
import { importsRoutes } from '../src/modules/imports/imports-routes.js';
import { supplierDebtRoutes } from '../src/modules/imports/supplier-debt-routes.js';
import { requireRole } from '../src/modules/auth/role-middleware.js';
import { authMiddleware } from '../src/modules/auth/auth-middleware.js';

let grant = false, active = true;
let lastWhere: any;
(prisma.user as any).findFirst = async ({where}:any) => where.orgId==='org' && active ? {role:'member',canManageImports:grant} : null;
(prisma.importOrder as any).findMany = async ({where}:any) => {lastWhere=where; return [{id:'own-import',createdById:where.createdById}];};
(prisma.importOrder as any).count = async () => 1;
(prisma.importOrder as any).findFirst = async ({where}:any) => {lastWhere=where; return null;};
(prisma.importOrder as any).create = async () => { throw new Error('Unexpected database mutation'); };
const app=Fastify();await app.register(jwt,{secret:'isolated-import-permission-test'});
await app.register(importsRoutes);await app.register(supplierDebtRoutes);
app.get('/admin-control',{preHandler:[authMiddleware,requireRole('owner','admin')]},async()=>({ok:true}));
const token=app.jwt.sign({id:'duc',orgId:'org',role:'member',canManageImports:true});
const call=(url:string,method:any='GET',payload?:any)=>app.inject({url,method,payload,headers:{authorization:'Bearer '+token}});
try{
 assert.equal((await call('/api/v1/imports')).statusCode,403,'JWT cannot forge DB grant');
 grant=true;
 assert.equal((await call('/api/v1/imports')).statusCode,200);assert.deepEqual(lastWhere,{orgId:'org',createdById:'duc'});
 for(const [url,method] of [['/api/v1/imports/other','GET'],['/api/v1/imports/other','PUT'],['/api/v1/imports/other','PATCH'],['/api/v1/imports/other/confirm','POST'],['/api/v1/imports/other/warnings','GET']]) {
  assert.equal((await call(url,method,method==='GET'?undefined:{})).statusCode,404);
  assert.equal(lastWhere.createdById,'duc'); assert.equal(lastWhere.orgId,'org');
 }
 assert.equal((await call('/api/v1/imports','POST',{depositAmount:1})).statusCode,403);
 assert.equal((await call('/api/v1/imports/own','PUT',{depositAmount:1})).statusCode,403);
 assert.equal((await call('/api/v1/imports/own','DELETE')).statusCode,403);
 assert.equal((await call('/api/v1/supplier-debt/orders/own/due-date','PUT',{})).statusCode,403);
 assert.equal((await call('/api/v1/supplier-debt/suppliers/any/balance')).statusCode,403);
 assert.equal((await call('/admin-control')).statusCode,403);
 assert.equal((await call('/api/v1/imports/parse-excel','POST',{})).statusCode,400,'authorized parse reaches missing-file validation');
 grant=false;assert.equal((await call('/api/v1/imports')).statusCode,403,'revocation is immediate');
 grant=true;active=false;assert.equal((await call('/api/v1/imports')).statusCode,403,'inactive user denied');
 console.log('PASS: DB-backed grant/revoke, own-only list/detail/edit/metadata/confirm/warnings, no deletes/deposits/supplier debt/admin access; zero DB writes.');
}finally{await app.close();await prisma.$disconnect();}
