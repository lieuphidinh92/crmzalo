import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';

// Dry-run by default; requires an explicitly identified 58NV1 warehouse.
// Never infer identity from "only one warehouse" or silently rename a warehouse.
const argument=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const apply=process.argv.includes('--apply');
const warehouse58=argument('warehouse58'),ownerId=argument('owner'),operatorId=argument('operator');
assert(warehouse58&&ownerId,'Usage: node --env-file=.env.prod scripts/provision-warehouse-portal.mjs --warehouse58=<verified-id> --owner=<owner-id> [--operator=<user-id>] [--apply]');
const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();
try{
  await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');await c.query("SET LOCAL lock_timeout='5s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('halo:warehouse-portal:provision'))");
  const warehouse=(await c.query('SELECT * FROM warehouses WHERE id=$1 AND active=true FOR UPDATE',[warehouse58])).rows[0];assert(warehouse,'Warehouse not found');
  const owner=(await c.query('SELECT id,org_id,role FROM users WHERE id=$1 AND is_active=true',[ownerId])).rows[0];
  assert(owner&&owner.org_id===warehouse.org_id&&['owner','admin'].includes(owner.role),'Owner must be an active administrator in the source organization');
  if(operatorId) assert((await c.query('SELECT id FROM users WHERE id=$1 AND org_id=$2 AND is_active=true',[operatorId,warehouse.org_id])).rows.length===1,'Operator must belong to the source organization');
  const tables=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'wp_%'")).rows.map(r=>r.tablename);
  const expected=['wp_warehouses','wp_baselines','wp_access','wp_sessions','wp_documents','wp_lines','wp_receipts','wp_receipt_lines','wp_audit','wp_product_links'];
  const initial=expected.filter(t=>t!=='wp_product_links');
  const upgrade=initial.every(t=>tables.includes(t))&&tables.length===initial.length;
  assert(tables.length===0||expected.every(t=>tables.includes(t))||upgrade,'Partial portal schema detected. Inspect before continuing.');
  const before={warehouse,portalTables:tables,stock:(await c.query('SELECT id,product_id,batch_code,current_quantity,import_cost FROM inventory_batches WHERE warehouse_id=$1 ORDER BY id FOR UPDATE',[warehouse58])).rows};
  if(apply){mkdirSync(new URL('./backups/',import.meta.url),{recursive:true});writeFileSync(new URL(`./backups/portal-before-${Date.now()}.json`,import.meta.url),JSON.stringify(before,null,2),{flag:'wx',mode:0o600});}
  if(!tables.length) await c.query(readFileSync(new URL('../src/modules/warehouse-portal/schema.sql',import.meta.url),'utf8'));
  else if(upgrade) await c.query(readFileSync(new URL('../src/modules/warehouse-portal/upgrade-product-links.sql',import.meta.url),'utf8'));
  let sg=(await c.query("SELECT * FROM wp_warehouses WHERE code='singapore'")).rows[0];
  const vn=(await c.query("SELECT * FROM wp_warehouses WHERE code='58nv1'")).rows[0];
  if(vn) assert.equal(vn.warehouse_id,warehouse58,'Portal already bound to a different 58NV1 warehouse');
  else await c.query("INSERT INTO wp_warehouses(code,name,org_id,warehouse_id,timezone) VALUES('58nv1','58NV1',$1,$2,'Asia/Ho_Chi_Minh')",[warehouse.org_id,warehouse58]);
  if(!sg){
    const orgId=randomUUID(),warehouseId=randomUUID();
    await c.query("INSERT INTO organizations(id,name,created_at,updated_at) VALUES($1,'Halo Singapore',timezone('UTC',now()),timezone('UTC',now()))",[orgId]);
    await c.query("INSERT INTO warehouses(id,org_id,name,active,created_at,updated_at) VALUES($1,$2,'Singapore',true,timezone('UTC',now()),timezone('UTC',now()))",[warehouseId,orgId]);
    await c.query("INSERT INTO wp_warehouses(code,name,org_id,warehouse_id,timezone) VALUES('singapore','Singapore',$1,$2,'Asia/Singapore')",[orgId,warehouseId]);
    sg={org_id:orgId,warehouse_id:warehouseId};
  }
  assert.notEqual(sg.org_id,warehouse.org_id,'Singapore must have a separate org to isolate legacy FIFO');
  for(const code of ['singapore','58nv1']){
    await c.query("INSERT INTO wp_access(warehouse_code,user_id,role,see_cost) VALUES($1,$2,'admin',true) ON CONFLICT(warehouse_code,user_id) DO NOTHING",[code,ownerId]);
    if(operatorId) await c.query("INSERT INTO wp_access(warehouse_code,user_id,role,see_cost) VALUES($1,$2,'operator',false) ON CONFLICT(warehouse_code,user_id) DO NOTHING",[code,operatorId]);
  }
  const catalog=JSON.parse(readFileSync(new URL('./catalog-singapore-20261103.json',import.meta.url)));
  const added=[];
  for(const p of catalog.products){
    if((await c.query('SELECT id FROM products WHERE org_id=$1 AND sku=$2',[sg.org_id,p.sku])).rows.length)continue;
    const id=randomUUID();
    await c.query(`INSERT INTO products(id,org_id,sku,name,package_size,unit,main_image_url,status,sellable,has_sales,allow_oversell,total_stock,warning_stock,gallery_urls,marketing_docs,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,'Lọ',$6,'active',true,false,false,0,30,'[]','[]',timezone('UTC',now()),timezone('UTC',now()))`,[id,sg.org_id,p.sku,p.name,p.packageSize,p.image]);
    added.push(p.sku);
  }
  // Snapshot initial physical stock in the portal's own ledger. Do not add
  // pretend adjustments to old CRM movement history or rewrite batch totals.
  if(!vn) await c.query("INSERT INTO wp_baselines(warehouse_code,batch_id,quantity) SELECT '58nv1',id,current_quantity FROM inventory_batches WHERE warehouse_id=$1",[warehouse58]);
  const after=(await c.query('SELECT id,product_id,batch_code,current_quantity,import_cost FROM inventory_batches WHERE warehouse_id=$1 ORDER BY id',[warehouse58])).rows;
  assert.deepEqual(after,before.stock,'Provisioning must not change existing stock or batch cost');
  const isolated=(await c.query('SELECT count(*)::int n FROM inventory_batches WHERE org_id=$1',[sg.org_id])).rows[0].n;
  console.log(JSON.stringify({mode:apply?'APPLY':'DRY RUN — rolled back',warehouse58:warehouse.name,portal58Id:warehouse58,singapore:sg,productsAdded:added,baselineSnapshots:vn?0:before.stock.length,existingStockUnchanged:true,singaporeExistingBatches:isolated,operatorCostAccess:false,enableFlag:'WAREHOUSE_PORTAL_ENABLED=true'},null,2));
  await c.query(apply?'COMMIT':'ROLLBACK');
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
