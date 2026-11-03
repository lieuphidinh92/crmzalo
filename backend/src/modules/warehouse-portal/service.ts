import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Queryable, Store } from './store.js';

export type Actor = { userId: string; warehouse: string; role: string; seeCost: boolean; warehouseId: string; orgId: string; timezone: string; fullName: string };
const fail = (message: string, statusCode = 400): never => { throw Object.assign(new Error(message), { statusCode }); };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const text = (s: unknown, label: string, max = 300): string => {
  if (typeof s !== 'string' || !s.trim() || s.trim().length > max) fail(`${label} không hợp lệ.`);
  return (s as string).trim();
};
function integer(n: unknown, label: string, min = 1): number {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > 1_000_000_000) fail(`${label} phải là số nguyên từ ${min} đến 1 tỷ.`);
  return n as number;
}
function date(s: unknown, label: string): string {
  if (typeof s !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(s)) fail(`${label} không hợp lệ (2000–2099).`);
  const parsed=new Date(`${s}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==s) fail(`${label} không hợp lệ (2000–2099).`);
  return s as string;
}
const day = (value: any): string | null => value == null ? null : value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
const normalized = (s: string | null) => (s || '').toLowerCase().replace(/\s/g,'');
const signature=(p:any)=>hash(JSON.stringify([p.sku,normalized(p.name),normalized(p.package_size)]));
export const confirmationFor = (warehouse: string) => warehouse === 'singapore' ? 'SINGAPORE' : '58NV1';
const writable = (a: Actor) => { if (!['operator','admin'].includes(a.role)) fail('Bạn chỉ có quyền xem kho này.',403); };
function confirm(a: Actor, body: any) {
  writable(a);
  if (body?.checked !== true || body?.confirmation !== confirmationFor(a.warehouse)) fail(`Hãy kiểm đếm và nhập đúng ${confirmationFor(a.warehouse)} để xác nhận.`);
}
async function audit(q: Queryable, a: Actor, action: string, id: string | null, details: unknown = {}) {
  await q.query('INSERT INTO wp_audit(id,warehouse_code,user_id,action,document_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)', [randomUUID(),a.warehouse,a.userId,action,id,JSON.stringify(details)]);
}
async function sync(q: Queryable, productId: string) {
  await q.query(`UPDATE products SET total_stock=(SELECT COALESCE(sum(current_quantity),0) FROM inventory_batches WHERE product_id=$1 AND status='active'),
    cost_price=CASE WHEN EXISTS(SELECT 1 FROM inventory_batches WHERE product_id=$1 AND status='active' AND current_quantity>0 AND import_cost IS NULL) THEN cost_price
      ELSE COALESCE((SELECT round(sum(current_quantity*import_cost)/NULLIF(sum(current_quantity),0),2) FROM inventory_batches WHERE product_id=$1 AND status='active' AND current_quantity>0),cost_price) END,
    has_sales=has_sales OR EXISTS(SELECT 1 FROM inventory_batches WHERE product_id=$1 AND status='active' AND current_quantity>0),updated_at=timezone('UTC',now()) WHERE id=$1`,[productId]);
}

export class WarehouseService {
  constructor(public db: Store) {}
  async login(warehouse: string, body: any, deviceKey?: string) {
    const email = text(body?.email,'Email').toLowerCase();
    if(typeof body?.password!=='string'||body.password.length<1||body.password.length>200) fail('Mật khẩu không hợp lệ.');
    const password = body.password;
    const user = (await this.db.query(`SELECT u.id,u.password_hash FROM users u JOIN wp_access a ON a.user_id=u.id JOIN wp_warehouses w ON w.code=a.warehouse_code
      WHERE lower(u.email)=$1 AND u.is_active=true AND w.active=true AND w.code=$2`,[email,warehouse])).rows[0];
    // Always compare a bcrypt hash, including unknown users; never expose grants.
    const valid = await bcrypt.compare(password, user?.password_hash || '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
    if (!user || !valid) fail('Email, mật khẩu hoặc quyền truy cập kho không hợp lệ.',401);
    const token = randomBytes(32).toString('hex');
    await this.db.transaction(async q=>{
      if(deviceKey){
        await q.query('SELECT pg_advisory_xact_lock(hashtext($1))',[deviceKey]);
        await q.query('DELETE FROM wp_sessions WHERE device_key=$1 AND warehouse_code<>$2',[deviceKey,warehouse]);
      }
      await q.query("INSERT INTO wp_sessions(token_hash,warehouse_code,user_id,device_key,expires_at) VALUES($1,$2,$3,$4,now()+interval '8 hours')",[hash(token),warehouse,user.id,deviceKey||null]);
    });
    return { token, profile: await this.authenticate(warehouse, token) };
  }
  async authenticate(warehouse: string, token: string, deviceKey?: string): Promise<Actor> {
    if (!/^[a-f0-9]{64}$/.test(token)) fail('Vui lòng đăng nhập riêng vào kho này.',401);
    const r = (await this.db.query(`SELECT s.user_id,a.role,a.see_cost,w.warehouse_id,w.org_id,w.timezone,u.full_name
      FROM wp_sessions s JOIN wp_warehouses w ON w.code=s.warehouse_code
      JOIN wp_access a ON a.warehouse_code=s.warehouse_code AND a.user_id=s.user_id JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.warehouse_code=$2 AND ($3::text IS NULL OR s.device_key=$3) AND s.expires_at>now() AND w.active=true AND u.is_active=true`,[hash(token),warehouse,deviceKey??null])).rows[0];
    if (!r) fail('Phiên kho đã hết hạn hoặc quyền đã thay đổi. Hãy đăng nhập lại.',401);
    return { userId:r.user_id,warehouse,role:r.role,seeCost:r.see_cost,warehouseId:r.warehouse_id,orgId:r.org_id,timezone:r.timezone,fullName:r.full_name };
  }
  async logout(token: string) { await this.db.query('DELETE FROM wp_sessions WHERE token_hash=$1',[hash(token)]); }
  today(a: Actor) { return new Intl.DateTimeFormat('en-CA',{timeZone:a.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  async catalog(a: Actor) {
    const rows = (await this.db.query(`SELECT p.id,p.sku,p.name,p.package_size,p.unit,p.main_image_url,p.warning_stock,
      COALESCE(sum(b.current_quantity) FILTER(WHERE b.status='active' AND (b.expiry_date IS NULL OR b.expiry_date >= $3::date)),0)::int stock,
      COALESCE(sum(b.current_quantity),0)::int physical_stock
      FROM products p LEFT JOIN inventory_batches b ON b.product_id=p.id AND b.warehouse_id=$2
      WHERE p.org_id=$1 AND ((p.status IN ('active','coming_soon') AND p.sellable=true AND ($4='singapore' OR p.has_sales=true))
        OR EXISTS(SELECT 1 FROM inventory_batches current_batch WHERE current_batch.product_id=p.id AND current_batch.warehouse_id=$2 AND current_batch.current_quantity>0))
      GROUP BY p.id ORDER BY p.name LIMIT 5000`,[a.orgId,a.warehouseId,this.today(a),a.warehouse])).rows;
    return rows;
  }
  async batches(a: Actor) {
    const rows = (await this.db.query(`SELECT b.id,b.product_id,b.batch_code,b.expiry_date,b.manufacture_date,b.current_quantity,b.status,b.import_cost,p.sku,p.name,
      (b.status='active' AND (b.expiry_date IS NULL OR b.expiry_date >= $3::date)) usable
      FROM inventory_batches b JOIN products p ON p.id=b.product_id WHERE b.org_id=$1 AND b.warehouse_id=$2 AND b.current_quantity>0
      ORDER BY b.expiry_date NULLS LAST,b.imported_at LIMIT 10000`,[a.orgId,a.warehouseId,this.today(a)])).rows;
    return rows.map(r => { if(!a.seeCost) delete r.import_cost; return r; });
  }
  async createProduct(a: Actor, body: any) {
    writable(a);
    const sku=text(body?.sku,'Mã sản phẩm',60).toUpperCase();
    if(!/^[A-Z0-9_-]+$/.test(sku)) fail('Mã chỉ gồm chữ, số, gạch ngang hoặc gạch dưới.');
    const name=text(body?.name,'Tên sản phẩm');
    const pack=text(body?.packageSize,'Quy cách',80);
    const unit=text(body?.unit,'Đơn vị',30);
    const image=body?.image ? text(body.image,'Ảnh',2000) : null;
    if(image && !image.startsWith('https://')) fail('Ảnh phải là đường dẫn HTTPS.');
    return this.db.transaction(async q=>{
      if((await q.query('SELECT id FROM products WHERE org_id=$1 AND upper(sku)=$2',[a.orgId,sku])).rows.length) fail('Mã đã tồn tại trong kho.',409);
      const id=randomUUID();
      await q.query(`INSERT INTO products(id,org_id,sku,name,package_size,unit,main_image_url,status,sellable,has_sales,allow_oversell,total_stock,warning_stock,gallery_urls,marketing_docs,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,'active',true,true,false,0,30,'[]','[]',timezone('UTC',now()),timezone('UTC',now()))`,[id,a.orgId,sku,name,pack,unit,image]);
      await audit(q,a,'product.created',null,{id,sku}); return {id};
    });
  }
  async list(a: Actor) {
    return (await this.db.query(`SELECT d.id,d.code,d.type,d.status,d.warehouse_code,d.destination_code,d.counterparty,d.document_date,d.created_at,
      COALESCE(sum(l.quantity),0)::int quantity,COALESCE(sum(l.received),0)::int received,COALESCE(sum(l.reconciled),0)::int reconciled
      FROM wp_documents d LEFT JOIN wp_lines l ON l.document_id=d.id
      WHERE d.warehouse_code=$1 OR (d.destination_code=$1 AND d.status NOT IN ('draft','cancelled'))
      GROUP BY d.id ORDER BY d.created_at DESC LIMIT 500`,[a.warehouse])).rows;
  }
  async detail(a: Actor, id: string, q: Queryable = this.db, lock = false) {
    const d = (await q.query(`SELECT * FROM wp_documents WHERE id=$1 AND (warehouse_code=$2 OR (destination_code=$2 AND status NOT IN ('draft','cancelled'))) ${lock?'FOR UPDATE':''}`,[id,a.warehouse])).rows[0];
    if(!d) fail('Không tìm thấy phiếu thuộc kho đang đăng nhập.',404);
    d.lines=(await q.query('SELECT * FROM wp_lines WHERE document_id=$1 ORDER BY sku,batch_code',[id])).rows;
    d.receipts=(await q.query(`SELECT r.id,r.type,r.note,r.created_at,u.full_name FROM wp_receipts r JOIN users u ON u.id=r.created_by WHERE r.document_id=$1 ORDER BY r.created_at`,[id])).rows;
    if(!a.seeCost) {
      delete d.exchange_rate;
      for(const l of d.lines) { delete l.cost_vnd; delete l.unit_cost_minor; }
    }
    return d;
  }
  async create(a: Actor, body: any) {
    writable(a);
    const type=body?.type;
    if(!['import','export','opening','stocktake','transfer'].includes(type)) fail('Loại phiếu không hợp lệ.');
    if(['opening','stocktake'].includes(type)&&a.role!=='admin') fail('Chỉ quản trị được mở sổ hoặc chốt kiểm kê.',403);
    if(['import','opening'].includes(type)&&!a.seeCost) fail('Phiếu nhập cần người có quyền nhập giá vốn.',403);
    const req=text(body.requestId,'Mã yêu cầu',100), fingerprint=hash(JSON.stringify(body));
    const counterparty=text(body.counterparty,'Nhà cung cấp / người nhận / lý do');
    const note=body.note ? text(body.note,'Ghi chú',2000) : '';
    const docDate=date(body.documentDate,'Ngày phiếu');
    if(docDate>this.today(a)) fail('Ngày phiếu không được ở tương lai.');
    const destination=type==='transfer' ? text(body.destination,'Kho nhận',20) : null;
    if(destination===a.warehouse) fail('Kho gửi và kho nhận phải khác nhau.');
    const currency=body.currency || 'VND';
    const fx=Number(body.exchangeRate || 1);
    if(!['VND','SGD'].includes(currency)||!Number.isFinite(fx)||fx<=0||fx>1e6||(currency==='VND'&&fx!==1)) fail('Đồng tiền hoặc tỷ giá không hợp lệ.');
    if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>100) fail('Phiếu cần từ 1 đến 100 dòng hàng.');
    return this.db.transaction(async q=>{
      const existing=(await q.query('SELECT id,request_hash FROM wp_documents WHERE warehouse_code=$1 AND request_id=$2',[a.warehouse,req])).rows[0];
      if(existing) { if(existing.request_hash!==fingerprint) fail('Mã yêu cầu đã dùng cho nội dung khác.',409); return {id:existing.id}; }
      if(destination&&!(await q.query('SELECT code FROM wp_warehouses WHERE code=$1 AND active=true',[destination])).rows.length) fail('Kho nhận chưa được cấu hình.');
      const id=randomUUID();
      const prefix={import:'NK',export:'XK',opening:'DK',stocktake:'KK',transfer:'CK'}[type as string];
      const code=`${a.warehouse==='singapore'?'SG':'NV1'}-${prefix}-${docDate.replace(/-/g,'')}-${id.slice(0,8).toUpperCase()}`;
      await q.query(`INSERT INTO wp_documents(id,code,warehouse_code,destination_code,type,request_id,request_hash,currency,exchange_rate,counterparty,note,document_date,created_by,attachment_url)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,code,a.warehouse,destination,type,req,fingerprint,currency,fx,counterparty,note,docDate,a.userId,body.attachmentUrl?this.attachment(body.attachmentUrl):null]);
      const seen=new Set();
      for(const input of body.lines) {
        const product=(await q.query('SELECT * FROM products WHERE id=$1 AND org_id=$2',[input.productId,a.orgId])).rows[0];
        if(!product) fail('Sản phẩm không thuộc kho đang đăng nhập.');
        const quantity=integer(input.quantity,'Số lượng',type==='stocktake'?0:1);
        let batch:any=null;
        if(['export','transfer','stocktake'].includes(type)) {
          batch=(await q.query('SELECT * FROM inventory_batches WHERE id=$1 AND product_id=$2 AND warehouse_id=$3 AND org_id=$4',[input.batchId,product.id,a.warehouseId,a.orgId])).rows[0];
          if(!batch) fail('Lô hàng không thuộc kho này.');
          if(type!=='stocktake'&&(batch.status!=='active'||(day(batch.expiry_date)&&day(batch.expiry_date)!<this.today(a)))) fail('Lô đã hết hạn hoặc bị khoá.');
          if(type==='stocktake') integer(input.expectedQuantity,'Tồn hệ thống lúc kiểm',0);
        }
        const batchCode=batch?.batch_code||text(input.batchCode,'Số lô',100);
        const exp=batch ? day(batch.expiry_date) : input.expiryDate ? date(input.expiryDate,'Hạn dùng') : null;
        const mfg=batch ? day(batch.manufacture_date) : input.manufactureDate ? date(input.manufactureDate,'Ngày sản xuất') : null;
        if(exp&&mfg&&exp<mfg) fail('Hạn dùng trước ngày sản xuất.');
        if(exp&&exp<this.today(a)&&['import','opening'].includes(type)) fail('Không nhập lô đã hết hạn vào tồn có thể xuất.');
        const key=product.id+':'+batchCode;
        if(seen.has(key)) fail('Lô sản phẩm bị lặp. Hãy gộp thành một dòng.'); seen.add(key);
        const minor=['import','opening'].includes(type)?integer(input.unitCostMinor,'Giá nhập',1):null;
        const cost=minor!==null?Math.round(minor*(currency==='SGD'?fx/100:1)):batch?.import_cost??null;
        if(type==='transfer'&&cost===null) fail('Lô chuyển cần được bổ sung giá vốn trước.');
        await q.query(`INSERT INTO wp_lines(id,document_id,product_id,sku,name,package_size,batch_id,batch_code,expiry_date,manufacture_date,quantity,expected_quantity,unit_cost_minor,cost_vnd)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[randomUUID(),id,product.id,product.sku,product.name,product.package_size,batch?.id??null,batchCode,exp,mfg,quantity,type==='stocktake'?input.expectedQuantity:null,minor,cost]);
      }
      await audit(q,a,'document.drafted',id,{type,code}); return {id};
    });
  }
  attachment(value: unknown) { const s=text(value,'Link chứng từ',2000); if(!s.startsWith('https://')) fail('Link chứng từ phải dùng HTTPS.'); return s; }
  async movement(q: Queryable, a: Actor, productId: string, batchId: string, quantity: number, type: string, docId: string, note: string) {
    await q.query(`INSERT INTO inventory_movements(id,org_id,product_id,batch_id,type,quantity,reference_type,reference_id,note,created_by,created_at)
      VALUES($1,$2,$3,$4,$5,$6,'warehouse_portal',$7,$8,$9,timezone('UTC',now()))`,[randomUUID(),a.orgId,productId,batchId,type,quantity,docId,note,a.userId]);
    await sync(q,productId);
  }
  async addStock(q: Queryable,a: Actor,l: any,qty: number,docId: string, note: string) {
    await q.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[l.product_id]);
    const b=(await q.query('SELECT * FROM inventory_batches WHERE org_id=$1 AND product_id=$2 AND batch_code=$3 FOR UPDATE',[a.orgId,l.product_id,l.batch_code])).rows[0];
    if(b&&(b.warehouse_id!==a.warehouseId||day(b.expiry_date)!==day(l.expiry_date)||day(b.manufacture_date)!==day(l.manufacture_date)||b.status!=='active')) fail('Lô đã có nhưng khác kho, ngày sản xuất, hạn dùng hoặc trạng thái. Cần quản trị đối chiếu.',409);
    let id=b?.id;
    if(b) {
      if(b.import_cost===null&&Number(b.current_quantity)>0) fail('Lô đang tồn thiếu giá vốn. Cần đối chiếu trước khi gộp.',409);
      await q.query(`UPDATE inventory_batches SET current_quantity=current_quantity+$2,import_quantity=import_quantity+$2,
        import_cost=CASE WHEN current_quantity+$2>0 THEN round((current_quantity*COALESCE(import_cost,0)+$2::numeric*$3::numeric)/(current_quantity+$2),2) ELSE $3::numeric END,updated_at=timezone('UTC',now()) WHERE id=$1`,[id,qty,l.cost_vnd]);
    } else {
      id=randomUUID();
      await q.query(`INSERT INTO inventory_batches(id,org_id,product_id,warehouse_id,batch_code,expiry_date,manufacture_date,import_quantity,current_quantity,import_cost,status,imported_at,created_by,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,'active',timezone('UTC',now()),$10,timezone('UTC',now()),timezone('UTC',now()))`,[id,a.orgId,l.product_id,a.warehouseId,l.batch_code,day(l.expiry_date),day(l.manufacture_date),qty,l.cost_vnd,a.userId]);
    }
    await this.movement(q,a,l.product_id,id,qty,'import',docId,note);
    return id;
  }
  async destinationProduct(q: Queryable, warehouse: any, l: any) {
    const p=(await q.query('SELECT * FROM products WHERE org_id=$1 AND sku=$2',[warehouse.org_id,l.sku])).rows[0];
    if(p) {
      if(normalized(p.package_size)!==normalized(l.package_size)||normalized(p.name)!==normalized(l.name)) {
        const approved=(await q.query(`SELECT 1 FROM wp_product_links WHERE
          (source_product_id=$1 AND destination_product_id=$2 AND source_signature=$3 AND destination_signature=$4) OR
          (source_product_id=$2 AND destination_product_id=$1 AND source_signature=$4 AND destination_signature=$3)`,[l.product_id,p.id,signature(l),signature(p)])).rows.length;
        if(!approved) fail(`Mã ${l.sku} ở hai kho khác tên hoặc quy cách. Quản trị cần xác nhận tại mục Liên kết sản phẩm trước khi gửi.`,409);
      }
      return {id:p.id,signature:signature(p)};
    }
    const source=(await q.query('SELECT unit,main_image_url FROM products WHERE id=$1',[l.product_id])).rows[0];
    const id=randomUUID();
    await q.query(`INSERT INTO products(id,org_id,sku,name,package_size,unit,main_image_url,status,sellable,has_sales,allow_oversell,total_stock,warning_stock,gallery_urls,marketing_docs,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'active',true,false,false,0,30,'[]','[]',timezone('UTC',now()),timezone('UTC',now()))`,[id,warehouse.org_id,l.sku,l.name,l.package_size,source.unit,source.main_image_url]);
    return {id,signature:signature(l)};
  }
  async commit(a: Actor,id: string, body: any) {
    confirm(a,body);
    return this.db.transaction(async q=>{
      const d=await this.detail({...a,seeCost:true},id,q,true);
      if(d.warehouse_code!==a.warehouse) fail('Chỉ kho lập phiếu được xác nhận gửi / xuất / nhập.',403);
      if(d.status!=='draft') fail('Phiếu đã được xử lý. Không xác nhận lại.',409);
      if(d.revision!==body.revision) fail('Phiếu đã thay đổi. Hãy xem lại.',409);
      if(['opening','stocktake'].includes(d.type)&&a.role!=='admin') fail('Cần quản trị xác nhận.',403);
      if(['opening','import'].includes(d.type)&&!a.seeCost) fail('Cần quyền nhập giá vốn.',403);
      const destination=d.type==='transfer'?(await q.query('SELECT * FROM wp_warehouses WHERE code=$1 AND active=true',[d.destination_code])).rows[0]:null;
      if(d.type==='transfer'&&!destination) fail('Kho nhận chưa sẵn sàng.',409);
      // Stable product order prevents interleaved batch updates from deadlocking.
      d.lines.sort((x:any,y:any)=>x.product_id.localeCompare(y.product_id));
      if(d.type==='opening') {
        for(const productId of new Set<string>(d.lines.map((l:any)=>l.product_id))) {
          await q.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[productId]);
          if((await q.query('SELECT id FROM inventory_batches WHERE product_id=$1 AND warehouse_id=$2',[productId,a.warehouseId])).rows.length) fail('Sản phẩm đã có lịch sử lô. Hãy dùng kiểm kê thay cho tồn đầu kỳ.',409);
        }
      }
      for(const l of d.lines) {
        const product=(await q.query('SELECT id,sku,name,package_size FROM products WHERE id=$1 AND org_id=$2 FOR UPDATE',[l.product_id,a.orgId])).rows[0];
        if(!product||product.sku!==l.sku||normalized(product.name)!==normalized(l.name)||normalized(product.package_size)!==normalized(l.package_size)) fail('Thông tin sản phẩm thay đổi sau khi lập phiếu. Hãy lập lại bản nháp.',409);
        if(['opening','import'].includes(d.type)) {
          if(day(l.expiry_date)&&day(l.expiry_date)!<this.today(a)) fail('Lô đã hết hạn trong lúc chờ xác nhận.',409);
          await this.addStock(q,a,l,l.quantity,id,d.code);
        } else {
          const batch=(await q.query('SELECT * FROM inventory_batches WHERE id=$1 AND warehouse_id=$2 AND org_id=$3 FOR UPDATE',[l.batch_id,a.warehouseId,a.orgId])).rows[0];
          if(!batch) fail('Lô không còn thuộc kho này.',409);
          if(batch.batch_code!==l.batch_code||day(batch.expiry_date)!==day(l.expiry_date)||day(batch.manufacture_date)!==day(l.manufacture_date)) fail('Thông tin lô đã thay đổi. Hãy đối chiếu và lập lại bản nháp.',409);
          if(d.type==='stocktake') {
            if(batch.status!=='active') fail('Chỉ kiểm kê điều chỉnh lô đang hoạt động. Lô khoá cần xử lý riêng.',409);
            if(batch.current_quantity!==l.expected_quantity) fail('Có nhập/xuất sau lúc ghi số kiểm. Hãy lập lại phiếu kiểm kê theo tồn mới.',409);
            const delta=l.quantity-batch.current_quantity;
            if(delta) {
              await q.query("UPDATE inventory_batches SET current_quantity=$2,updated_at=timezone('UTC',now()) WHERE id=$1",[batch.id,l.quantity]);
              await this.movement(q,a,l.product_id,batch.id,delta,'adjust',id,`${d.code}: ${d.counterparty}`);
            }
          } else {
            if(batch.status!=='active'||(day(batch.expiry_date)&&day(batch.expiry_date)!<this.today(a))) fail('Lô hết hạn hoặc đã bị khoá.',409);
            const updated=await q.query("UPDATE inventory_batches SET current_quantity=current_quantity-$2,updated_at=timezone('UTC',now()) WHERE id=$1 AND current_quantity >= $2 RETURNING id",[batch.id,l.quantity]);
            if(!updated.rows.length) fail(`Không đủ tồn lô ${l.batch_code}. Tải lại phiếu để kiểm tra.`,409);
            await q.query('UPDATE wp_lines SET cost_vnd=$2 WHERE id=$1',[l.id,batch.import_cost]);
            if(d.type==='transfer') {
              if(batch.import_cost===null) fail('Lô thiếu giá vốn.',409);
              const target=await this.destinationProduct(q,destination,l);
              await q.query('UPDATE wp_lines SET destination_product_id=$2,destination_signature=$3 WHERE id=$1',[l.id,target.id,target.signature]);
            }
            await this.movement(q,a,l.product_id,batch.id,-l.quantity,'export',id,d.code);
          }
        }
      }
      await q.query('UPDATE wp_documents SET status=$2,revision=revision+1,confirmed_by=$3,confirmed_at=now() WHERE id=$1',[id,d.type==='transfer'?'dispatched':'confirmed',a.userId]);
      await audit(q,a,'document.confirmed',id,{code:d.code,type:d.type}); return {id};
    });
  }
  async cancel(a: Actor,id: string,body: any) {
    confirm(a,body);
    return this.db.transaction(async q=>{
      const d=await this.detail(a,id,q,true);
      if(d.warehouse_code!==a.warehouse) fail('Chỉ kho lập phiếu được huỷ.',403);
      if(d.status!=='draft'||d.revision!==body.revision) fail('Chỉ huỷ được bản nháp chưa thay đổi.',409);
      await q.query("UPDATE wp_documents SET status='cancelled',revision=revision+1 WHERE id=$1",[id]);
      await audit(q,a,'document.cancelled',id,{reason:text(body.note,'Lý do huỷ',1000)}); return {id};
    });
  }
  async receive(a: Actor,id: string,body: any,reconcile=false) {
    confirm(a,body);
    if(reconcile&&a.role!=='admin') fail('Chỉ quản trị kho nhận được chốt chênh lệch.',403);
    const req=text(body.requestId,'Mã yêu cầu',100), fingerprint=hash(JSON.stringify(body));
    const note=text(body.note,reconcile?'Lý do xử lý thiếu / hỏng':'Ghi chú kiểm đếm',1000);
    if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>100) fail('Chọn ít nhất một dòng nhận thực tế.');
    return this.db.transaction(async q=>{
      const d=await this.detail({...a,seeCost:true},id,q,true);
      if(d.destination_code!==a.warehouse||d.type!=='transfer') fail('Chỉ đăng nhập kho nhận mới được xác nhận nhận hàng.',403);
      const old=(await q.query('SELECT request_hash,type FROM wp_receipts WHERE document_id=$1 AND request_id=$2',[id,req])).rows[0];
      if(old) {if(old.request_hash!==fingerprint||old.type!==(reconcile?'reconcile':'receive')) fail('Mã yêu cầu bị dùng lại với nội dung khác.',409); return {id};}
      if(!['dispatched','partial'].includes(d.status)||d.revision!==body.revision) fail('Phiếu đã thay đổi hoặc chưa được gửi. Tải lại và kiểm đếm.',409);
      const rid=randomUUID(), seen=new Set();
      await q.query('INSERT INTO wp_receipts(id,document_id,warehouse_code,request_id,request_hash,type,created_by,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[rid,id,a.warehouse,req,fingerprint,reconcile?'reconcile':'receive',a.userId,note]);
      for(const item of body.lines) {
        const l=d.lines.find((x:any)=>x.id===item.lineId);
        if(!l||seen.has(item.lineId)) fail('Dòng hàng không hợp lệ hoặc bị lặp.'); seen.add(item.lineId);
        const qty=integer(item.quantity,'Số thực nhận / xử lý');
        if(qty>l.quantity-l.received-l.reconciled) fail('Số lượng vượt phần hàng còn đang vận chuyển.',409);
        if(!reconcile) {
          if(day(l.expiry_date)&&day(l.expiry_date)!<this.today(a)) fail('Hàng đã hết hạn. Cần quản trị đối soát, không cộng vào tồn có thể xuất.',409);
          const target=(await q.query('SELECT id,sku,name,package_size FROM products WHERE id=$1 AND org_id=$2',[l.destination_product_id,a.orgId])).rows[0];
          if(!target||signature(target)!==l.destination_signature) fail('Thông tin mã nhận đã thay đổi. Cần đối chiếu trước khi nhận.',409);
          await this.addStock(q,a,{...l,product_id:target.id},qty,id,`${d.code}: nhận từ ${d.warehouse_code}`);
        }
        await q.query(`UPDATE wp_lines SET ${reconcile?'reconciled':'received'}=${reconcile?'reconciled':'received'}+$2 WHERE id=$1`,[l.id,qty]);
        await q.query('INSERT INTO wp_receipt_lines(id,receipt_id,line_id,quantity) VALUES($1,$2,$3,$4)',[randomUUID(),rid,l.id,qty]);
      }
      const remaining=(await q.query('SELECT COALESCE(sum(quantity-received-reconciled),0)::int remaining FROM wp_lines WHERE document_id=$1',[id])).rows[0].remaining;
      await q.query('UPDATE wp_documents SET status=$2,revision=revision+1 WHERE id=$1',[id,remaining===0?'completed':'partial']);
      await audit(q,a,reconcile?'transfer.reconciled':'transfer.received',id,{receiptId:rid,note,lines:body.lines}); return {id};
    });
  }
  async report(a: Actor, from: string, to: string) {
    date(from,'Từ ngày'); date(to,'Đến ngày'); if(from>to) fail('Khoảng ngày không hợp lệ.');
    const start=(await this.db.query('SELECT opened_at,(opened_at AT TIME ZONE timezone)::date first_day FROM wp_warehouses WHERE code=$1',[a.warehouse])).rows[0];
    if(start&&from<day(start.first_day)!) fail(`Báo cáo cổng kho bắt đầu từ ${day(start.first_day)}. Kỳ trước cần đối chiếu sổ kho cũ.`);
    // Opening snapshots live in portal-only tables. Legacy history is never
    // rewritten to make its historic movement sums match the physical count.
    const rows=(await this.db.query(`WITH quantities AS (
      SELECT b.product_id,
        COALESCE(bl.quantity,0)+COALESCE(sum(m.quantity) FILTER(WHERE (m.created_at AT TIME ZONE 'UTC') < ($3::date::timestamp AT TIME ZONE $5)),0) opening,
        COALESCE(sum(m.quantity) FILTER(WHERE m.quantity>0 AND m.type<>'adjust' AND (m.created_at AT TIME ZONE 'UTC') >= ($3::date::timestamp AT TIME ZONE $5)),0) incoming,
        COALESCE(-sum(m.quantity) FILTER(WHERE m.quantity<0 AND m.type<>'adjust' AND (m.created_at AT TIME ZONE 'UTC') >= ($3::date::timestamp AT TIME ZONE $5)),0) outgoing,
        COALESCE(sum(m.quantity) FILTER(WHERE m.type='adjust' AND (m.created_at AT TIME ZONE 'UTC') >= ($3::date::timestamp AT TIME ZONE $5)),0) adjustment,
        COALESCE(bl.quantity,0)+COALESCE(sum(m.quantity),0) closing
      FROM inventory_batches b LEFT JOIN wp_baselines bl ON bl.batch_id=b.id AND bl.warehouse_code=$7
      LEFT JOIN inventory_movements m ON m.batch_id=b.id AND (m.created_at AT TIME ZONE 'UTC') >= $6::timestamptz
        AND (m.created_at AT TIME ZONE 'UTC') < (($4::date+1)::timestamp AT TIME ZONE $5)
      WHERE b.org_id=$1 AND b.warehouse_id=$2 GROUP BY b.id,bl.quantity
    ) SELECT p.sku,p.name,p.package_size,COALESCE(sum(q.opening),0)::int opening,COALESCE(sum(q.incoming),0)::int incoming,
      COALESCE(sum(q.outgoing),0)::int outgoing,COALESCE(sum(q.adjustment),0)::int adjustment,COALESCE(sum(q.closing),0)::int closing
      FROM products p LEFT JOIN quantities q ON q.product_id=p.id WHERE p.org_id=$1 GROUP BY p.id
      HAVING COALESCE(sum(abs(q.opening)+abs(q.incoming)+abs(q.outgoing)+abs(q.adjustment)+abs(q.closing)),0)>0
      ORDER BY p.sku`,[a.orgId,a.warehouseId,from,to,a.timezone,start.opened_at,a.warehouse])).rows;
    return rows;
  }
  async history(a: Actor) {
    return (await this.db.query(`SELECT m.id,m.type,m.quantity,m.note,(m.created_at AT TIME ZONE 'UTC') created_at,p.sku,p.name,b.batch_code,u.full_name
      FROM inventory_movements m JOIN inventory_batches b ON b.id=m.batch_id JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.created_by
      WHERE b.org_id=$1 AND b.warehouse_id=$2 ORDER BY m.created_at DESC LIMIT 500`,[a.orgId,a.warehouseId])).rows;
  }
  async access(a: Actor) {
    if(a.role!=='admin') fail('Chỉ quản trị kho được quản lý quyền.',403);
    return (await this.db.query(`SELECT u.id,u.full_name,u.email,pa.role,pa.see_cost FROM users u LEFT JOIN wp_access pa ON pa.user_id=u.id AND pa.warehouse_code=$1
      WHERE u.org_id=(SELECT org_id FROM users WHERE id=$2) AND u.is_active=true ORDER BY u.full_name`,[a.warehouse,a.userId])).rows;
  }
  async productLinks(a: Actor) {
    if(a.role!=='admin') fail('Chỉ quản trị được đối chiếu mã giữa hai kho.',403);
    const other=(await this.db.query('SELECT org_id FROM wp_warehouses WHERE code<>$1 AND active=true',[a.warehouse])).rows[0];
    if(!other) return [];
    const rows=(await this.db.query(`SELECT p.id source_id,p.sku,p.name source_name,p.package_size source_pack,
      t.id target_id,t.name target_name,t.package_size target_pack FROM products p JOIN products t ON t.sku=p.sku
      WHERE p.org_id=$1 AND t.org_id=$2 ORDER BY p.sku`,[a.orgId,other.org_id])).rows;
    const links=(await this.db.query('SELECT * FROM wp_product_links')).rows;
    return rows.map(r=>{
      const ss=signature({sku:r.sku,name:r.source_name,package_size:r.source_pack}),ts=signature({sku:r.sku,name:r.target_name,package_size:r.target_pack});
      const approved=links.some(l=>(l.source_product_id===r.source_id&&l.destination_product_id===r.target_id&&l.source_signature===ss&&l.destination_signature===ts)||(l.destination_product_id===r.source_id&&l.source_product_id===r.target_id&&l.destination_signature===ss&&l.source_signature===ts));
      return {...r,source_signature:ss,target_signature:ts,compatible:ss===ts,approved};
    });
  }
  async approveProductLink(a: Actor,body:any) {
    if(a.role!=='admin') fail('Chỉ quản trị được xác nhận liên kết sản phẩm.',403);
    confirm(a,body);
    return this.db.transaction(async q=>{
      const source=(await q.query('SELECT id,sku,name,package_size FROM products WHERE id=$1 AND org_id=$2 FOR UPDATE',[body.sourceId,a.orgId])).rows[0];
      const target=(await q.query('SELECT p.id,p.sku,p.name,p.package_size FROM products p JOIN wp_warehouses w ON w.org_id=p.org_id WHERE p.id=$1 AND w.code<>$2 AND w.active=true FOR UPDATE OF p',[body.targetId,a.warehouse])).rows[0];
      if(!source||!target||source.sku!==target.sku) fail('Chỉ liên kết hai sản phẩm cùng mã đã đối chiếu ở đúng hai kho.');
      if(signature(source)!==body.sourceSignature||signature(target)!==body.targetSignature) fail('Thông tin sản phẩm đã thay đổi. Tải lại và đối chiếu.',409);
      await q.query(`INSERT INTO wp_product_links(source_product_id,destination_product_id,source_signature,destination_signature,warehouse_code,approved_by)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_product_id,destination_product_id) DO UPDATE SET source_signature=EXCLUDED.source_signature,
        destination_signature=EXCLUDED.destination_signature,approved_by=EXCLUDED.approved_by,approved_at=now()`,[source.id,target.id,body.sourceSignature,body.targetSignature,a.warehouse,a.userId]);
      await audit(q,a,'products.linked',null,{sourceId:source.id,targetId:target.id,sourceSignature:body.sourceSignature,targetSignature:body.targetSignature});return {linked:true};
    });
  }
  async setAccess(a: Actor,body: any) {
    if(a.role!=='admin') fail('Chỉ quản trị kho được quản lý quyền.',403);
    confirm(a,body);
    const id=text(body.userId,'Người dùng',100);
    if(id===a.userId) fail('Không tự thay đổi quyền của phiên đang dùng.');
    if(!['viewer','operator','admin','none'].includes(body.role)||typeof body.seeCost!=='boolean') fail('Quyền không hợp lệ.');
    return this.db.transaction(async q=>{
      const user=(await q.query('SELECT id FROM users WHERE id=$1 AND org_id=(SELECT org_id FROM users WHERE id=$2) AND is_active=true',[id,a.userId])).rows[0];
      if(!user) fail('Người dùng không thuộc đơn vị quản lý.',404);
      if(body.role==='none') await q.query('DELETE FROM wp_access WHERE warehouse_code=$1 AND user_id=$2',[a.warehouse,id]);
      else await q.query(`INSERT INTO wp_access(warehouse_code,user_id,role,see_cost) VALUES($1,$2,$3,$4)
        ON CONFLICT(warehouse_code,user_id) DO UPDATE SET role=EXCLUDED.role,see_cost=EXCLUDED.see_cost`,[a.warehouse,id,body.role,body.seeCost]);
      await q.query('DELETE FROM wp_sessions WHERE warehouse_code=$1 AND user_id=$2',[a.warehouse,id]);
      await audit(q,a,'access.changed',null,{userId:id,role:body.role,seeCost:body.seeCost}); return {updated:true};
    });
  }
}
