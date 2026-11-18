import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';

// Quantity-only reconciliation. Missing SKUs, existing lot metadata and costs stay unchanged.
// Default: preview and ROLLBACK. Source is an uncommitted Google Sheets snapshot.
const apply = process.argv.includes('--apply');
const source = JSON.parse(readFileSync(new URL('./stocktake-20261105-source.json', import.meta.url)));
const org = '7dc86328-624d-4e2d-b0b6-bc62b574a95a';
const warehouse = 'ccec90d0-5524-4ea6-9b29-2a829de8fefd';
const cutoff = '2026-11-05 17:00:00'; // naive UTC = 06/11 00:00 Vietnam
const marker = `stocktake-20261105:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
assert.equal(source.missingSkus, 'preserve');
assert.equal(source.rows.length, 87);
assert.equal(new Set(source.rows.map(r => r[0])).size, 87);
assert.equal(source.rows.reduce((n, r) => n + Number(r[2]), 0), 2750);
const rows = source.rows.map(([sku, name, qty, date]) => {
  assert(Number.isSafeInteger(Number(qty)) && Number(qty) >= 0, `Invalid count ${sku}`);
  const m = String(date ?? '').match(/^(\d{1,2})\/(\d{4})$/) ?? String(date ?? '').match(/^(\d{2})(\d{4})$/);
  const month = m ? `${m[2]}-${m[1].padStart(2, '0')}` : null;
  if (m) assert(Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 2026 && Number(m[2]) <= 2100);
  return { sku, name, qty: Number(qty), date: date ?? null, month };
});
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await c.connect();
try {
  await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await c.query("SET LOCAL lock_timeout='5s'");
  await c.query("SET LOCAL statement_timeout='60s'");
  // Short write lock makes the preview-to-write calculation atomic with imports/FIFO.
  if (apply) await c.query('LOCK TABLE products,inventory_batches,inventory_movements,stocktake_sessions,stocktake_items IN SHARE ROW EXCLUSIVE MODE');
  const done = (await c.query('SELECT id,code FROM stocktake_sessions WHERE org_id=$1 AND note LIKE $2 AND status=$3', [org, `%${marker}%`, 'completed'])).rows;
  if (done.length) {
    console.log(JSON.stringify({ alreadyApplied: done[0] }));
    await c.query('ROLLBACK');
    process.exitCode = 0;
  } else {
    assert.equal((await c.query('SELECT id FROM warehouses WHERE id=$1 AND org_id=$2 AND active=true', [warehouse, org])).rows.length, 1);
    const actor = (await c.query("SELECT id FROM users WHERE org_id=$1 AND role='owner' AND is_active=true ORDER BY id LIMIT 1", [org])).rows[0];
    assert(actor, 'Owner not found');
    const allProducts = (await c.query('SELECT id,sku,total_stock,cost_price,has_sales,updated_at FROM products WHERE org_id=$1 ORDER BY id', [org])).rows;
    const allBatches = (await c.query("SELECT b.*,to_char(expiry_date,'YYYY-MM-DD') expiry FROM inventory_batches b WHERE org_id=$1 ORDER BY id", [org])).rows;
    const bySku = new Map(allProducts.map(p => [p.sku, p]));
    const ids = rows.map(r => { assert(bySku.has(r.sku), `SKU missing: ${r.sku}`); return bySku.get(r.sku).id; });
    const movements = (await c.query(`SELECT m.*,o.order_code,io.import_code,o.order_date,io.import_date FROM inventory_movements m
      LEFT JOIN orders o ON m.reference_type='order' AND o.id=m.reference_id
      LEFT JOIN import_orders io ON m.reference_type='import_order' AND io.id=m.reference_id
      WHERE m.org_id=$1 AND m.product_id=ANY($2) AND m.created_at >= $3::timestamp ORDER BY m.created_at`, [org, ids, cutoff])).rows;
    assert(movements.every(m => ['order','import_order'].includes(m.reference_type)), 'Unexpected movement: inspect before applying');
    // Backdated documents need a decision; never silently infer physical movement from their creation time.
    assert(movements.every(m => m.reference_type === 'order' ? m.order_date && m.order_date >= new Date(cutoff+'Z') : m.import_date && m.import_date >= new Date('2026-11-06T00:00:00Z')), 'Backdated document after count: inspect before applying');
    const plan = rows.map(r => {
      const p = bySku.get(r.sku);
      const net = movements.filter(m => m.product_id === p.id).reduce((n,m) => n+m.quantity, 0);
      const target = r.qty + net;
      if (target < 0) assert(r.sku === 'OTB01' && target === -42 && source.negativeTargets.includes('authorized'), 'Negative target requires explicit authorization');
      const lots = allBatches.filter(b => b.product_id === p.id && b.status === 'active');
      assert(lots.every(b => b.warehouse_id === warehouse), 'SKU has other warehouse stock');
      const current = lots.reduce((n,b) => n+b.current_quantity, 0);
      let delta = target - current;
      const desired = new Map(lots.map(b => [b.id, b.current_quantity]));
      const sorted = [...lots].sort((a,b) => {
        // Preserve quantities received after count when reducing old system stock.
        const na = movements.filter(m => m.batch_id === a.id).reduce((n,m) => n+m.quantity,0);
        const nb = movements.filter(m => m.batch_id === b.id).reduce((n,m) => n+m.quantity,0);
        return Number(na > 0)-Number(nb > 0) || String(a.expiry ?? '9999').localeCompare(String(b.expiry ?? '9999')) || new Date(a.imported_at)-new Date(b.imported_at) || a.id.localeCompare(b.id);
      });
      if (delta < 0) {
        let cut = -delta;
        for (const b of sorted) { const n=Math.min(Math.max(0,desired.get(b.id)),cut); desired.set(b.id,desired.get(b.id)-n); cut-=n; }
        if (cut) { assert(target < 0); const lot=sorted.find(b => b.expiry?.startsWith(r.month)) ?? sorted[0]; assert(lot); desired.set(lot.id,desired.get(lot.id)-cut); }
      } else if (delta > 0 && lots.length) {
        const lot=sorted.find(b => r.month && b.expiry?.startsWith(r.month)) ?? sorted.at(-1);
        desired.set(lot.id,desired.get(lot.id)+delta);
      }
      const changes=lots.filter(b => desired.get(b.id)!==b.current_quantity).map(b => ({batch:b,after:desired.get(b.id),delta:desired.get(b.id)-b.current_quantity}));
      const newLot=lots.length===0 && target!==0 ? {id:randomUUID(),code:`KK20261105-${r.sku}`,qty:target,expiry:r.month ? `${r.month}-01` : null,cost:p.cost_price} : null;
      assert.equal([...desired.values()].reduce((n,v)=>n+v,0)+(newLot?.qty??0),target);
      return {...r,product:p,net,current,target,changes,newLot};
    });
    const summary={mode:apply?'APPLY':'PREVIEW',sourceCount:2750,skuCount:plan.length,net:plan.reduce((n,p)=>n+p.net,0),targetTotal:plan.reduce((n,p)=>n+p.target,0),changedSkus:plan.filter(p=>p.current!==p.target || p.product.total_stock!==p.target).length,newLots:plan.filter(p=>p.newLot).length,negative:plan.filter(p=>p.target<0).map(p=>({sku:p.sku,target:p.target})),missingCosts:plan.filter(p=>p.newLot&&p.newLot.cost===null).map(p=>p.sku)};
    const folder=new URL('./backups/',import.meta.url);mkdirSync(folder,{recursive:true});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const reportPath=new URL(`stocktake-20261105-${apply?'before':'preview'}-${stamp}.json`,folder);
    writeFileSync(reportPath,JSON.stringify({marker,summary,source,plan,movements,...(apply?{allProducts,allBatches}:{})},null,2),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({...summary,report:reportPath.pathname},null,2));
    if (!apply) await c.query('ROLLBACK');
    else {
      const note=`Kiểm kê cuối ngày 05/11/2026 — KHO TẦNG 1; chỉ 87 mã trong file, mã khác giữ nguyên. Tồn điều chỉnh tại lúc ghi = số kiểm + giao dịch từ 06/11; OTB01=-42 được CEO xác nhận. ${marker}`;
      const id=randomUUID();
      const last=(await c.query("SELECT code FROM stocktake_sessions WHERE org_id=$1 AND code LIKE 'KK-202611-%' ORDER BY code DESC LIMIT 1",[org])).rows[0];
      const code=`KK-202611-${String(last?Number(last.code.split('-').at(-1))+1:1).padStart(3,'0')}`;
      const itemCount=plan.reduce((n,p)=>n+p.changes.length+(p.newLot?1:0),0);
      await c.query(`INSERT INTO stocktake_sessions(id,org_id,warehouse_id,code,status,period_month,note,item_count,counted_count,variance_qty,variance_value,created_by,completed_by,completed_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,'completed','2026-11',$5,$6,$6,$7,$8,$9,$9,timezone('UTC',now()),timezone('UTC',now()),timezone('UTC',now()))`,[id,org,warehouse,code,note,itemCount,plan.reduce((n,p)=>n+p.target-p.current,0),plan.reduce((n,p)=>n+p.changes.reduce((s,x)=>s+x.delta*Number(x.batch.import_cost??0),0)+(p.newLot?Number(p.newLot.cost??0)*p.newLot.qty:0),0),actor.id]);
      for (const p of plan) {
        if (p.newLot) {
          const b=p.newLot;
          await c.query(`INSERT INTO inventory_batches(id,org_id,product_id,warehouse_id,batch_code,expiry_date,import_quantity,current_quantity,import_cost,status,imported_at,created_by,notes,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6::date,0,0,$7,'active',$8::timestamp,$9,$10,timezone('UTC',now()),timezone('UTC',now()))`,[b.id,org,p.product.id,warehouse,b.code,b.expiry,b.cost,cutoff,actor.id,`Lô kiểm kê, không có mã lô NSX trong file. HSD nguồn: ${p.date??'không có'}; chỉ tháng dùng ngày 01 theo quy ước hệ thống. Giá vốn từ registry, null nếu chưa có. ${marker}`]);
          p.changes.push({batch:{id:b.id,batch_code:b.code,current_quantity:0,import_cost:b.cost},after:b.qty,delta:b.qty});
        }
        for (const ch of p.changes) {
          const itemNote=`Số kiểm cuối 05/11: ${p.qty}; giao dịch sau kiểm: ${p.net}; tồn đích hiện tại: ${p.target}; HSD nguồn: ${p.date??'không có'}. Giữ nguyên metadata lô cũ.`;
          await c.query('UPDATE inventory_batches SET current_quantity=$2,updated_at=timezone(\'UTC\',now()) WHERE id=$1',[ch.batch.id,ch.after]);
          await c.query('INSERT INTO stocktake_items(id,session_id,batch_id,product_id,system_qty,counted_qty,variance,unit_cost,note,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,timezone(\'UTC\',now()),timezone(\'UTC\',now()))',[randomUUID(),id,ch.batch.id,p.product.id,ch.batch.current_quantity,ch.after,ch.delta,ch.batch.import_cost,itemNote]);
          await c.query('INSERT INTO inventory_movements(id,org_id,product_id,batch_id,type,quantity,reference_type,reference_id,note,created_by,created_at) VALUES($1,$2,$3,$4,\'adjust\',$5,\'stocktake\',$6,$7,$8,timezone(\'UTC\',now()))',[randomUUID(),org,p.product.id,ch.batch.id,ch.delta,id,`${code}: ${itemNote}`,actor.id]);
        }
        if (p.changes.length || p.product.total_stock!==p.target) await c.query('UPDATE products SET total_stock=$2,has_sales=has_sales OR $2>0,updated_at=timezone(\'UTC\',now()) WHERE id=$1',[p.product.id,p.target]);
      }
      const afterProducts=(await c.query('SELECT id,sku,total_stock,cost_price,has_sales,updated_at FROM products WHERE org_id=$1 ORDER BY id',[org])).rows;
      const afterBatches=(await c.query("SELECT b.*,to_char(expiry_date,'YYYY-MM-DD') expiry FROM inventory_batches b WHERE org_id=$1 ORDER BY id",[org])).rows;
      const targetIds=new Set(ids);
      assert.deepEqual(afterProducts.filter(p=>!targetIds.has(p.id)),allProducts.filter(p=>!targetIds.has(p.id)),'Unlisted product changed');
      assert.deepEqual(afterBatches.filter(b=>!targetIds.has(b.product_id)),allBatches.filter(b=>!targetIds.has(b.product_id)),'Unlisted lot changed');
      for(const p of plan) {
        const actual=afterProducts.find(a=>a.id===p.product.id);
        assert.equal(actual.total_stock,p.target,p.sku);
        assert.equal(actual.cost_price,p.product.cost_price,'Cost registry changed');
        assert.equal(afterBatches.filter(b=>b.product_id===p.product.id&&b.status==='active').reduce((n,b)=>n+b.current_quantity,0),p.target,p.sku);
      }
      assert.equal((await c.query('SELECT count(*)::int n FROM stocktake_items WHERE session_id=$1',[id])).rows[0].n,itemCount);
      await c.query('COMMIT');
      console.log(JSON.stringify({committed:true,session:id,code,verifiedSkus:87,unlistedProductsUnchanged:true,unlistedBatchesUnchanged:true,originalCostsUnchanged:true}));
    }
  }
} catch(e) { await c.query('ROLLBACK');throw e; } finally { await c.end(); }
