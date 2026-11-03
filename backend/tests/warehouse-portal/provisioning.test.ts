import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
import {fixture} from './fixture.js';
import {postgresStore} from '../../src/modules/warehouse-portal/store.js';

const url=process.env.WAREHOUSE_PROVISION_QA_URL;
test('provisioning dry-run, install and rerun preserve legacy physical stock',{skip:!url},async t=>{
  const target=new URL(url!);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55488');assert.match(target.pathname,/^\/portal_qa_provision/);
  const pool=new pg.Pool({connectionString:url});t.after(()=>pool.end());
  const store=postgresStore(pool);
  const f=await fixture({store,db:{query:(sql:string,v:any[])=>pool.query(sql,v),exec:(sql:string)=>pool.query(sql)}});
  await pool.query("INSERT INTO products(id,org_id,sku,name,package_size,total_stock) VALUES('legacy','org-vn','LEGACY','Existing stock','1 lọ',7)");
  await pool.query("INSERT INTO inventory_batches(id,org_id,product_id,warehouse_id,batch_code,expiry_date,import_quantity,current_quantity,import_cost,status) VALUES('legacy-lot','org-vn','legacy','wh-vn','L-EXISTING','2029-12-31',7,7,10000,'active')");
  // Fresh-install simulation in a strictly loopback-only, disposable database.
  await pool.query('DROP TABLE wp_product_links,wp_receipt_lines,wp_receipts,wp_lines,wp_audit,wp_documents,wp_sessions,wp_baselines,wp_access,wp_warehouses CASCADE');
  const command=promisify(execFile);
  const script=new URL('../../scripts/provision-warehouse-portal.mjs',import.meta.url).pathname;
  const run=async(apply=false)=>JSON.parse((await command(process.execPath,[script,'--warehouse58=wh-vn','--owner=admin','--operator=duc',...(apply?['--apply']:[])],{env:{...process.env,DATABASE_URL:url}})).stdout);
  const dry=await run();assert.equal(dry.existingStockUnchanged,true);
  assert.equal((await pool.query("SELECT to_regclass('wp_warehouses') present")).rows[0].present,null);
  const applied=await run(true);assert.equal(applied.productsAdded.length,3);assert.equal(applied.baselineSnapshots,1);
  assert.equal((await pool.query("SELECT current_quantity FROM inventory_batches WHERE id='legacy-lot'")).rows[0].current_quantity,7);
  assert.equal((await pool.query("SELECT total_stock FROM products WHERE id='legacy'")).rows[0].total_stock,7);
  const sg=(await pool.query("SELECT org_id,warehouse_id FROM wp_warehouses WHERE code='singapore'")).rows[0];assert.notEqual(sg.org_id,'org-vn');
  assert.equal((await pool.query('SELECT count(*)::int n FROM products WHERE org_id=$1 AND cost_price IS NULL AND total_stock=0',[sg.org_id])).rows[0].n,3);
  assert.equal((await pool.query("SELECT count(*)::int n FROM pg_class WHERE relname=ANY($1) AND relrowsecurity=true",[['wp_warehouses','wp_baselines','wp_access','wp_sessions','wp_documents','wp_lines','wp_receipts','wp_receipt_lines','wp_audit','wp_product_links']])).rows[0].n,10);
  assert.equal((await pool.query('SELECT count(*)::int n FROM inventory_movements')).rows[0].n,0);
  const a=(await f.service.login('58nv1',{email:'admin@warehouse.test',password:f.password})).profile;
  assert.equal((await f.service.report(a,f.service.today(a),f.service.today(a)))[0].closing,7);
  const again=await run(true);assert.equal(again.productsAdded.length,0);assert.equal(again.baselineSnapshots,0);
  await pool.query('DROP TABLE wp_product_links; ALTER TABLE wp_lines DROP COLUMN destination_signature');
  await run();assert.equal((await pool.query("SELECT to_regclass('wp_product_links') present")).rows[0].present,null);
  await run(true);assert.equal((await pool.query("SELECT to_regclass('wp_product_links') present")).rows[0].present,'wp_product_links');
  assert.equal((await pool.query('SELECT current_quantity FROM inventory_batches WHERE id=$1',['legacy-lot'])).rows[0].current_quantity,7);
  assert.equal((await pool.query('SELECT count(*)::int n FROM inventory_movements')).rows[0].n,0);
});
