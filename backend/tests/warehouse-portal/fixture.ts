import {PGlite} from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import {readFileSync} from 'node:fs';
import {WarehouseService} from '../../src/modules/warehouse-portal/service.js';
import type {Store} from '../../src/modules/warehouse-portal/store.js';

// Disposable database only; never consumes .env or DATABASE_URL.
export async function fixture(external?: {db:any;store:Store}) {
  const db=external?.db??new PGlite();
  await db.exec(`
  CREATE TABLE organizations(id text PRIMARY KEY,name text NOT NULL,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
  CREATE TABLE users(id text PRIMARY KEY,org_id text REFERENCES organizations(id),email text UNIQUE,password_hash text,full_name text,role text,is_active boolean DEFAULT true);
  CREATE TABLE warehouses(id text PRIMARY KEY,org_id text REFERENCES organizations(id),name text,address text,manager_id text,active boolean DEFAULT true,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
  CREATE TABLE products(id text PRIMARY KEY,org_id text REFERENCES organizations(id),sku text,name text,package_size text,unit text,main_image_url text,status text,sellable boolean,has_sales boolean,allow_oversell boolean,total_stock integer DEFAULT 0,warning_stock integer DEFAULT 30,cost_price numeric(15,2),gallery_urls jsonb,marketing_docs jsonb,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),UNIQUE(org_id,sku));
  CREATE TABLE inventory_batches(id text PRIMARY KEY,org_id text REFERENCES organizations(id),product_id text REFERENCES products(id),warehouse_id text REFERENCES warehouses(id),batch_code text,expiry_date date,manufacture_date date,import_quantity integer,current_quantity integer,import_cost numeric(15,2),status text,imported_at timestamp DEFAULT now(),created_by text,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),UNIQUE(org_id,product_id,batch_code));
  CREATE TABLE inventory_movements(id text PRIMARY KEY,org_id text,product_id text,batch_id text REFERENCES inventory_batches(id),type text,quantity integer,reference_type text,reference_id text,note text,created_by text,created_at timestamp DEFAULT now());
  INSERT INTO organizations(id,name) VALUES('org-vn','Sỉ TPCN'),('org-sg','Halo Singapore');
  INSERT INTO warehouses(id,org_id,name) VALUES('wh-vn','org-vn','58NV1'),('wh-sg','org-sg','Singapore');
  `);
  await db.exec(readFileSync(new URL('../../src/modules/warehouse-portal/schema.sql',import.meta.url),'utf8'));
  const password='OnlyLocal-QA-2026!';const passwordHash=await bcrypt.hash(password,4);
  for(const [id,role] of [['admin','admin'],['duc','operator'],['viewer','viewer']]) {
    await db.query('INSERT INTO users(id,org_id,email,password_hash,full_name,role) VALUES($1,$2,$3,$4,$5,$6)',[id,'org-vn',`${id}@warehouse.test`,passwordHash,id==='duc'?'Đức · Tài khoản thử':id,role==='operator'?'member':role]);
  }
  await db.exec(`INSERT INTO wp_warehouses(code,name,org_id,warehouse_id,timezone) VALUES('singapore','Singapore','org-sg','wh-sg','Asia/Singapore'),('58nv1','58NV1','org-vn','wh-vn','Asia/Ho_Chi_Minh');
    INSERT INTO wp_access VALUES('singapore','admin','admin',true),('58nv1','admin','admin',true),('singapore','duc','operator',false),('58nv1','duc','operator',false),('singapore','viewer','viewer',false);`);
  const wrap=(client:any)=>({query:async(sql:string,values?:any[])=>{const result=await client.query(sql,values);return {rows:result.rows,rowCount:result.affectedRows};}});
  const store:Store=external?.store??{...wrap(db),transaction:fn=>db.transaction(async tx=>fn(wrap(tx)))};
  const service=new WarehouseService(store);
  return {db,store,service,password,close:()=>db.close()};
}
