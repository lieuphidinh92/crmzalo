import type { FastifyInstance, FastifyRequest } from 'fastify';
import pg from 'pg';
import { WarehouseService, type Actor } from './service.js';
import { postgresStore } from './store.js';

type Options = { service?: WarehouseService; enabled?: boolean };
export async function warehousePortalRoutes(app: FastifyInstance, options: Options = {}) {
  if (!(options.enabled ?? process.env.WAREHOUSE_PORTAL_ENABLED === 'true')) return;
  const pool=options.service?null:new pg.Pool({connectionString:process.env.DATABASE_URL,max:5});
  const service=options.service || new WarehouseService(postgresStore(pool!));
  if(pool) app.addHook('onClose',async()=>{await pool.end();});
  app.setErrorHandler((error:any,_req,reply)=>{
    const status=error.statusCode || (['23505','40001','40P01'].includes(error.code)?409:500);
    if(status>=500) app.log.error(error);
    reply.status(status).send({error:status>=500?'Chưa thể xử lý. Giữ nguyên phiếu và thử lại sau.':status===409&&error.code?'Dữ liệu vừa thay đổi. Hãy tải lại và kiểm tra.':error.message});
  });
  app.addHook('onSend',async(_req,reply,payload)=>{reply.header('Cache-Control','no-store'); return payload;});
  const prefix='/api/warehouse/v1/:warehouse';
  const actors=new WeakMap<FastifyRequest,Actor>();
  const token=(r:FastifyRequest)=>r.headers.authorization?.startsWith('Bearer ')?r.headers.authorization.slice(7):'';
  const code=(r:FastifyRequest)=>(r.params as any).warehouse;
  const actor=(r:FastifyRequest)=>actors.get(r)!;
  const guard=async(r:FastifyRequest)=>{actors.set(r,await service.authenticate(code(r),token(r)));};
  app.post(prefix+'/login',{config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async r=>service.login(code(r),r.body));
  await app.register(async protectedApp=>{
    protectedApp.addHook('preHandler',guard);
    protectedApp.get(prefix+'/profile',async r=>actor(r));
    protectedApp.post(prefix+'/logout',async r=>{await service.logout(token(r));return {loggedOut:true};});
    protectedApp.get(prefix+'/products',async r=>({products:await service.catalog(actor(r))}));
    protectedApp.post(prefix+'/products',async r=>service.createProduct(actor(r),r.body));
    protectedApp.get(prefix+'/batches',async r=>({batches:await service.batches(actor(r))}));
    protectedApp.get(prefix+'/documents',async r=>({documents:await service.list(actor(r))}));
    protectedApp.post(prefix+'/documents',async r=>service.create(actor(r),r.body));
    protectedApp.get(prefix+'/documents/:id',async r=>service.detail(actor(r),(r.params as any).id));
    protectedApp.post(prefix+'/documents/:id/confirm',async r=>service.commit(actor(r),(r.params as any).id,r.body));
    protectedApp.post(prefix+'/documents/:id/cancel',async r=>service.cancel(actor(r),(r.params as any).id,r.body));
    protectedApp.post(prefix+'/documents/:id/receive',async r=>service.receive(actor(r),(r.params as any).id,r.body));
    protectedApp.post(prefix+'/documents/:id/reconcile',async r=>service.receive(actor(r),(r.params as any).id,r.body,true));
    protectedApp.get(prefix+'/history',async r=>({movements:await service.history(actor(r))}));
    protectedApp.get(prefix+'/access',async r=>({users:await service.access(actor(r))}));
    protectedApp.post(prefix+'/access',async r=>service.setAccess(actor(r),r.body));
    protectedApp.get(prefix+'/report',async r=>{const p=r.query as any;return {rows:await service.report(actor(r),p.from,p.to)};});
    protectedApp.get(prefix+'/report.xlsx',async(r,reply)=>{
      const p=r.query as any, a=actor(r), rows=await service.report(a,p.from,p.to);
      const {default:ExcelJS}=await import('exceljs');
      const book=new ExcelJS.Workbook();const sheet=book.addWorksheet(a.warehouse==='singapore'?'Singapore':'58NV1');
      sheet.addRow(['Mã','Tên','Quy cách','Tồn đầu','Nhập','Xuất','Điều chỉnh','Tồn cuối']);
      for(const row of rows) sheet.addRow([row.sku,row.name,row.package_size,row.opening,row.incoming,row.outgoing,row.adjustment,row.closing]);
      sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];
      sheet.columns.forEach((col,i)=>{col.width=i===1?55:18;});
      reply.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition',`attachment; filename="${a.warehouse}-${p.from}-${p.to}.xlsx"`);
      return reply.send(Buffer.from(await book.xlsx.writeBuffer()));
    });
  });
}
