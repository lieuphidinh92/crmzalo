import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { uploadToStorage } from '../../shared/storage/supabase-storage.js';
import { extractReceipt } from './extraction.js';
const base = '/api/v1/receipt-assistant';
const fail = (s: string, statusCode = 400, code?: string): never => { throw Object.assign(new Error(s), { statusCode, code }); };
const digest = (v: any) => createHash('sha256').update(Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');
const norm = (v: any) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ref = (v: any) => norm(v).replace(/ /g, '');
const num = (v: any) => Number(v || 0);
const proofs = (s: any): string[] => { if (!s)
    return []; try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [s];
}
catch {
    return [s];
} };
const customer = (c: any) => ({ id: c.id, name: c.storeName ? `${c.fullName} · ${c.storeName}` : (c.fullName || 'Chưa có tên'), phone: c.phone });
export function validateBillFields(bills: any[], action: string) {
    if (!Array.isArray(bills) || !bills.length || bills.length > 5)
        fail('Cần từ 1 đến 5 bill');
    for (const b of bills) {
        if (!b || typeof b !== 'object')
            fail('Thông tin bill không hợp lệ');
        if (!Number.isSafeInteger(b.amount) || b.amount <= 0 || b.amount > 999999999999)
            fail('Số tiền mỗi bill phải là số nguyên VND lớn hơn 0');
        if (typeof b.paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.paymentDate) || Number.isNaN(Date.parse(b.paymentDate)) || new Date(b.paymentDate).toISOString().slice(0, 10) !== b.paymentDate)
            fail('Ngày thu không hợp lệ');
        if (b.paymentDate < '2000-01-01' || b.paymentDate > '2100-12-31')
            fail('Ngày thu phải trong khoảng năm 2000–2100');
        if (b.paymentDate > new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10))
            fail('Ngày thu không được ở tương lai');
        if (b.transactionRef != null && (typeof b.transactionRef !== 'string' || b.transactionRef.length > 100))
            fail('Mã giao dịch tối đa 100 ký tự');
    }
    if (action !== 'attach' && new Set(bills.map(b => b.paymentDate)).size > 1)
        fail('Bill khác ngày cần ghi nhận thành các phiếu riêng');
    const refs = bills.map(b => ref(b.transactionRef)).filter(Boolean);
    if (new Set(refs).size !== refs.length)
        fail('Mã giao dịch của các bill bị trùng');
}
export function allocate(orders: any[], amount: number) { let remaining = amount; const result: any[] = []; for (const o of orders) {
    const applied = Math.min(remaining, num(o.debtAmountValue));
    if (applied > 0)
        result.push({ orderId: o.id, orderCode: o.orderCode, applied });
    remaining -= applied;
    if (remaining <= 0)
        break;
} return result; }
async function actor(req: any, db: any = prisma) { if (typeof req.user?.id !== 'string' || !req.user.id || typeof req.user?.orgId !== 'string' || !req.user.orgId) fail('Phiên đăng nhập không hợp lệ', 401); const u = await db.user.findFirst({ where: { id: req.user.id, orgId: req.user.orgId, isActive: true }, select: { id: true, orgId: true, role: true } }); if (!u || !['owner', 'admin'].includes(u.role))
    fail('Chỉ chủ doanh nghiệp hoặc kế toán có quyền quản trị được dùng trợ lý thu tiền', 403); return u; }
async function draft(db: any, id: string, u: any) { if (typeof id !== 'string')
    fail('Thiếu mã bản nháp'); const d = await db.receiptAssistantDraft.findFirst({ where: { id, orgId: u.orgId, createdById: u.id } }); if (!d)
    fail('Không tìm thấy bản nháp', 404); if (d.status !== 'confirmed' && d.expiresAt < new Date())
    fail('Bản nháp hết hạn, vui lòng tải lại bill', 410); return d; }
async function snapshot(db: any, orgId: string, contactId: string) {
    if (typeof contactId !== 'string')
        fail('Chưa chọn khách hàng');
    const c = await db.contact.findFirst({ where: { id: contactId, orgId } });
    if (!c)
        fail('Khách hàng không tồn tại', 404);
    const orders = await db.order.findMany({ where: { orgId, contactId, debtAmountValue: { gt: 0 }, status: { notIn: ['cancelled', 'returned'] } }, orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], select: { id: true, orderCode: true, orderDate: true, debtAmountValue: true, paidAmount: true } });
    const payments = await db.customerPayment.findMany({ where: { orgId, contactId, reversedAt: null }, orderBy: [{ paymentDate: 'desc' }, { id: 'asc' }], select: { id: true, amount: true, paymentDate: true, reference: true, proofUrl: true, unallocatedAmount: true } });
    return { customer: customer(c), orders, payments, debt: orders.reduce((s: number, o: any) => s + num(o.debtAmountValue), 0), advanceCredit: payments.reduce((s: number, p: any) => s + num(p.unallocatedAmount), 0) };
}
async function duplicates(db: any, orgId: string, bills: any[]) {
    const evidence = await db.receiptAssistantEvidence.findMany({ where: { orgId, OR: [{ hash: { in: bills.map(b => b.hash) } }, { transactionRef: { in: bills.map(b => ref(b.transactionRef)).filter(Boolean) } }] } });
    const refs = new Set(bills.map(b => ref(b.transactionRef)).filter(Boolean));
    const legacy = refs.size ? await db.customerPayment.findMany({ where: { orgId, reference: { not: null } }, select: { id: true, reference: true } }) : [];
    return [...evidence.map((e: any) => ({ paymentId: e.paymentId, reason: 'Ảnh hoặc mã giao dịch đã được sử dụng' })), ...legacy.filter((p: any) => refs.has(ref(p.reference))).map((p: any) => ({ paymentId: p.id, reason: 'Mã giao dịch trùng phiếu đã có' }))];
}
async function buildPreview(db: any, u: any, d: any, input: any) {
    if (!['collect', 'advance', 'attach'].includes(input.action))
        fail('Loại ghi nhận không hợp lệ');
    validateBillFields(input.bills, input.action);
    const stored = d.bills as any[];
    if (input.bills.length !== stored.length || new Set(input.bills.map((b: any) => b.id)).size !== stored.length)
        fail('Bill không khớp bản nháp');
    const bills = input.bills.map((b: any) => { const o = stored.find(x => x.id === b.id); if (!o)
        fail('Bill không thuộc bản nháp'); return { ...o, amount: b.amount, paymentDate: b.paymentDate, transactionRef: b.transactionRef?.trim() || null }; });
    const s = await snapshot(db, u.orgId, input.contactId);
    const amount = bills.reduce((n: number, b: any) => n + b.amount, 0);
    const dup = await duplicates(db, u.orgId, bills);
    const warnings = ['Một số chứng từ cũ chưa được kiểm tra trùng tự động. Đối chiếu phiếu hiện có trước khi tạo khoản thu mới.'];
    if (bills.some((b: any) => !b.transactionRef))
        warnings.push('Có bill chưa có mã giao dịch; cần kiểm tra kỹ khả năng trùng.');
    const similar = s.payments.filter((p: any) => bills.some((b: any) => num(p.amount) === b.amount && new Date(p.paymentDate).toISOString().slice(0, 10) === b.paymentDate));
    if (similar.length)
        warnings.push(`Có ${similar.length} phiếu cùng số tiền và ngày. Đối chiếu các phiếu hiện có trước khi xác nhận.`);
    let target: any = null;
    if (input.action === 'attach') {
        target = s.payments.find((p: any) => p.id === input.paymentId);
        if (!target)
            fail('Phiếu thu không thuộc khách hoặc đã đảo');
        warnings.push('Chỉ bổ sung ảnh; giữ nguyên số tiền, ngày thu và công nợ của phiếu.');
    }
    const canConfirm = !dup.some((x: any) => input.action !== 'attach' || x.paymentId !== target?.id) && (input.action !== 'collect' || amount <= s.debt);
    if (input.action === 'collect' && amount > s.debt)
        warnings.push('Số tiền vượt nợ hiện tại. Chọn ứng trước hoặc tách khoản thu.');
    const allocations = input.action === 'collect' ? allocate(s.orders, amount) : [];
    return { public: { action: input.action, amount, paymentDate: bills[0].paymentDate, customer: s.customer, debtBefore: s.debt, debtAfter: s.debt - allocations.reduce((n: number, a: any) => n + a.applied, 0), advanceBefore: s.advanceCredit, advanceAfter: s.advanceCredit + (input.action === 'advance' ? amount : 0), allocations, duplicates: dup, warnings, canConfirm }, snapshotHash: digest(s), bills, input: { contactId: input.contactId, action: input.action, paymentId: target?.id || null, bills: input.bills, note: typeof input.note === 'string' ? input.note.slice(0, 2000) : '' } };
}
export async function receiptAssistantRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);
    app.addHook('preHandler', async (req) => { await actor(req); });
    app.setErrorHandler((e: any, _req, reply) => { reply.status(e.statusCode || (e.code === 'P2034' ? 409 : 500)).send({ error: e.statusCode ? e.message : e.code === 'P2034' ? 'Dữ liệu vừa thay đổi, vui lòng xem trước lại' : 'Không thể xử lý phiếu thu, vui lòng thử lại.', code: e.code === 'P2034' ? 'STALE_PREVIEW' : e.code }); });
    app.post(base + '/analyze', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any) => {
        const u = await actor(req);
        const files: any[] = [];
        for await (const part of req.parts({ limits: { files: 5, fileSize: 8 * 1024 * 1024, fields: 2 } })) {
            if (part.type !== 'file')
                continue;
            const buffer = await part.toBuffer();
            const mime = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? 'image/jpeg' : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
            if (!mime || buffer.length < 12 || part.file.truncated)
                fail('Chỉ nhận PNG/JPG/WEBP, tối đa 8 MB mỗi ảnh');
            const h = digest(buffer);
            if (files.some(f => f.hash === h))
                fail('Hai ảnh tải lên trùng nhau');
            files.push({ buffer, mime, hash: h });
        }
        if (!files.length)
            fail('Chưa chọn ảnh bill');
        const bills: any[] = [];
        // Two concurrent calls at most; five images finish within the UI request budget.
        for (let offset = 0; offset < files.length; offset += 2) {
            const group = await Promise.all(files.slice(offset, offset + 2).map(async (f) => {
                const url = await uploadToStorage(f.buffer, f.mime, 'proofs', u.orgId);
                let fields: any = { amount: null, paymentDate: null, transactionRef: null, senderName: null, description: null, warnings: [] };
                try {
                    fields = await extractReceipt(u.orgId, { buffer: f.buffer, mime: f.mime });
                }
                catch (e: any) {
                    fields.warnings = [typeof e?.message === 'string' ? e.message : 'Chưa đọc tự động được ảnh. Vui lòng nhập và kiểm tra thông tin từ bill.'];
                }
                return { id: randomUUID(), hash: f.hash, url, fields, warnings: fields.warnings || [] };
            }));
            bills.push(...group);
        }
        const d = await prisma.receiptAssistantDraft.create({ data: { orgId: u.orgId, createdById: u.id, bills, expiresAt: new Date(Date.now() + 24 * 3600000) } });
        return { draftId: d.id, bills: bills.map(({ hash: _hash, ...b }) => b), warnings: ['Thông tin từ ảnh là gợi ý, cần kiểm tra trước khi xác nhận.'] };
    });
    app.get(base + '/drafts/:id', async (req: any) => { const d = await draft(prisma, req.params.id, await actor(req)); const p = d.preview as any; return { draftId: d.id, status: d.status, bills: (d.bills as any[]).map(({ hash: _hash, ...b }) => ({ ...b, fields: { ...b.fields, ...p?.input?.bills?.find((x: any) => x.id === b.id) } })), result: d.result, ...(p?.input ? { contactId: p.input.contactId, action: p.input.action, paymentId: p.input.paymentId, note: p.input.note } : {}) }; });
    app.get(base + '/customers', async (req: any) => { const u = await actor(req); const d = req.query.draftId ? await draft(prisma, req.query.draftId, u) : null; const suggestedQuery = d ? ((d.bills as any[])[0]?.fields?.senderName || '') : ''; const q = norm(String(req.query.q || suggestedQuery).slice(0, 200)); const terms = q.split(' ').filter(Boolean); const rows = await prisma.contact.findMany({ where: { orgId: u.orgId }, select: { id: true, fullName: true, storeName: true, phone: true } }); const customers = rows.map(c => { const hay = norm(`${c.fullName} ${c.storeName || ''} ${c.phone || ''}`); const score = q ? terms.filter(t => hay.includes(t)).length / terms.length : 0; return { ...customer(c), score, reasons: score ? ['Tên hoặc số điện thoại khớp tìm kiếm'] : [] }; }).filter(c => !q || c.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 30); return { customers, suggestedQuery }; });
    app.get(base + '/customers/:id', async (req: any) => { const u = await actor(req); const s = await snapshot(prisma, u.orgId, req.params.id); const d = req.query.draftId ? await draft(prisma, req.query.draftId, u) : null; const bs = d?.bills as any[] | undefined; const total = bs?.reduce((n: number, b: any) => n + num(b.fields?.amount), 0) || 0; const possible = s.payments.filter((p: any) => bs?.some((b: any) => num(p.amount) === num(b.fields?.amount) || (b.fields?.transactionRef && ref(p.reference) === ref(b.fields.transactionRef)))); const suggestedAction = possible.length ? 'attach' : total > 0 && total <= s.debt ? 'collect' : s.debt === 0 && total > 0 ? 'advance' : null; return { suggestedAction, suggestionReason: possible.length ? 'Có phiếu thu có số tiền hoặc mã giao dịch khớp bill; kiểm tra trước khi tạo khoản thu mới.' : suggestedAction === 'collect' ? 'Số tiền bill nằm trong tổng nợ hiện tại.' : suggestedAction === 'advance' ? 'Khách không còn nợ đơn hàng; có thể ghi nhận tiền ứng trước.' : 'Cần kiểm tra số tiền và phiếu thu hiện có.', possiblePaymentIds: possible.map((p: any) => p.id), customer: s.customer, debt: s.debt, advanceCredit: s.advanceCredit, orders: s.orders.map((o: any) => ({ id: o.id, orderCode: o.orderCode, debt: num(o.debtAmountValue), orderDate: o.orderDate })), payments: s.payments.map((p: any) => ({ id: p.id, amount: num(p.amount), paymentDate: p.paymentDate, reference: p.reference, proofUrls: proofs(p.proofUrl) })) }; });
    app.post(base + '/preview', async (req: any) => { const u = await actor(req); const input = req.body || {}; return prisma.$transaction(async (tx) => { const d = await draft(tx, input.draftId, u); if (d.status === 'confirmed')
        fail('Phiếu đã được xác nhận', 409); const p = await buildPreview(tx, u, d, input); const previewToken = randomUUID(); await tx.receiptAssistantDraft.update({ where: { id: d.id }, data: { preview: { ...p, previewToken, expiresAt: Date.now() + 10 * 60000 } as any } }); return { ...p.public, previewToken }; }, { isolationLevel: 'Serializable' }); });
    app.post(base + '/confirm', async (req: any) => {
        const input = req.body || {};
        return prisma.$transaction(async (tx) => {
            const u = await actor(req, tx);
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${u.orgId}),hashtext('receipt-assistant'))`;
            const d = await draft(tx, input.draftId, u);
            const p = d.preview as any;
            if (!p || p.previewToken !== input.previewToken)
                fail('Bản xem trước không hợp lệ', 409, 'STALE_PREVIEW');
            if (d.status === 'confirmed')
                return d.result;
            if (Date.now() > p.expiresAt)
                fail('Bản xem trước hết hạn', 409, 'STALE_PREVIEW');
            const fresh = await buildPreview(tx, u, d, p.input);
            if (fresh.snapshotHash !== p.snapshotHash || !fresh.public.canConfirm)
                fail('Công nợ hoặc chứng từ đã thay đổi, vui lòng xem trước lại', 409, 'STALE_PREVIEW');
            let payment: any;
            if (p.input.action === 'attach') {
                payment = await tx.customerPayment.findFirst({ where: { id: p.input.paymentId, orgId: u.orgId, contactId: p.input.contactId, reversedAt: null } });
                if (!payment)
                    fail('Phiếu thu không còn khả dụng', 409, 'STALE_PREVIEW');
                payment = await tx.customerPayment.update({ where: { id: payment.id }, data: { proofUrl: JSON.stringify([...new Set([...proofs(payment.proofUrl), ...fresh.bills.map((b: any) => b.url)])]) } });
            }
            else {
                for (const a of fresh.public.allocations) {
                    const changed = await tx.order.updateMany({ where: { id: a.orderId, orgId: u.orgId, contactId: p.input.contactId, debtAmountValue: { gte: a.applied } }, data: { paidAmount: { increment: a.applied }, debtAmountValue: { decrement: a.applied } } });
                    if (changed.count !== 1)
                        fail('Công nợ vừa thay đổi', 409, 'STALE_PREVIEW');
                }
                payment = await tx.customerPayment.create({ data: { orgId: u.orgId, contactId: p.input.contactId, amount: fresh.public.amount, unallocatedAmount: p.input.action === 'advance' ? fresh.public.amount : 0, paymentMethod: 'bank_transfer', paymentDate: new Date(fresh.public.paymentDate + 'T00:00:00Z'), reference: fresh.bills.length === 1 ? fresh.bills[0].transactionRef : null, note: p.input.note || (p.input.action === 'advance' ? 'Khách ứng trước — trợ lý thu tiền' : 'Trợ lý thu tiền'), proofUrl: JSON.stringify(fresh.bills.map((b: any) => b.url)), allocations: fresh.public.allocations, createdById: u.id } });
            }
            for (const b of fresh.bills) {
                const existing = await tx.receiptAssistantEvidence.findUnique({ where: { orgId_hash: { orgId: u.orgId, hash: b.hash } } });
                if (!existing)
                    await tx.receiptAssistantEvidence.create({ data: { orgId: u.orgId, paymentId: payment.id, hash: b.hash, transactionRef: ref(b.transactionRef) || null, url: b.url } });
            }
            const result = { paymentId: payment.id, action: p.input.action, amount: num(payment.amount), remainingDebt: fresh.public.debtAfter, advanceCredit: fresh.public.advanceAfter, proofUrls: proofs(payment.proofUrl) };
            await tx.activityLog.create({ data: { orgId: u.orgId, userId: u.id, action: 'receipt_assistant.' + p.input.action, entityType: 'customer_payment', entityId: payment.id, details: { draftId: d.id, contactId: p.input.contactId, bills: fresh.bills.map((b: any) => ({ url: b.url, hash: b.hash, amount: b.amount, paymentDate: b.paymentDate, transactionRef: b.transactionRef })), allocations: fresh.public.allocations, amount: result.amount, note: p.input.note } } });
            await tx.receiptAssistantDraft.update({ where: { id: d.id }, data: { status: 'confirmed', result } });
            return result;
        }, { isolationLevel: 'Serializable', timeout: 20000 });
    });
}
