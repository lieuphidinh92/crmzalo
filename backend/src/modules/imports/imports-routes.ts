/**
 * Import-order REST endpoints (Session 3.5A — Module Giá Vốn FIFO).
 *
 * Lifecycle: header is created in `draft` (POST), edited freely (PUT/
 * DELETE), then frozen by `confirm` which materialises one
 * `inventory_batches` row per line item and appends `inventory_movements`
 * (type=import) for the audit trail. Confirmed orders are read-only;
 * editing requires creating a new draft.
 *
 * `confirm` also re-syncs each affected product's `totalStock` and
 * `costPrice`. `costPrice` becomes the qty-weighted average across all
 * remaining `active` batches so reports continue to work for sale-side
 * estimates while the FIFO allocator (3.5B) handles real per-line cost.
 *
 * All endpoints require owner|admin. `member` role gets 403 — cost data
 * is sensitive.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import ExcelJS from 'exceljs';

const VALID_STATUSES = ['draft', 'confirmed'] as const;

interface ItemPayload {
  productId: string;
  batchCode: string;
  quantity: number;
  unitCost: number;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

interface CreateImportBody {
  supplierId?: string | null;
  warehouseId?: string | null;
  importDate?: string | null;
  nccInvoiceNo?: string | null;
  notes?: string | null;
  attachments?: Array<{ name: string; url: string; type?: string }>;
  items?: ItemPayload[];
  // ── Phiếu nhập POS: phí / chiết khấu / VAT / cọc ──
  shippingFee?: number | null;
  discountType?: 'amount' | 'percent' | null;
  discountValue?: number | null;
  vatRate?: number | null;
  depositAmount?: number | null;
}

interface UpdateImportBody extends CreateImportBody {}

/** Ép về số nguyên VND >= 0 (an toàn với null/undefined/NaN). */
function intVnd(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Tính khối tiền của phiếu nhập từ giá trị hàng + các khoản phí/chiết khấu/VAT/cọc.
 *  Tất cả là số nguyên VND.
 *    Cần thanh toán (grandTotal) = giá trị hàng − chiết khấu + phí ship + VAT
 *    VAT tính trên (giá trị hàng − chiết khấu).
 *    Cọc bị kẹp trong [0, grandTotal]. */
function computeCharges(goodsValue: number, body: CreateImportBody) {
  const shippingFee = intVnd(body.shippingFee);
  const discountType = body.discountType === 'percent' ? 'percent' : 'amount';
  const discountValueRaw = Number(body.discountValue);
  const discountValue = Number.isFinite(discountValueRaw) && discountValueRaw > 0 ? discountValueRaw : 0;
  let discountAmount =
    discountType === 'percent'
      ? Math.round((goodsValue * Math.min(discountValue, 100)) / 100)
      : Math.round(discountValue);
  discountAmount = Math.min(Math.max(0, discountAmount), goodsValue); // không vượt giá trị hàng
  const vatRateRaw = Math.round(Number(body.vatRate));
  const vatRate = Number.isFinite(vatRateRaw) && vatRateRaw > 0 ? vatRateRaw : 0;
  const taxBase = goodsValue - discountAmount;
  const vatAmount = Math.round((taxBase * vatRate) / 100);
  const grandTotal = taxBase + shippingFee + vatAmount;
  const depositAmount = Math.min(intVnd(body.depositAmount), grandTotal);
  return { shippingFee, discountType, discountValue, discountAmount, vatRate, vatAmount, grandTotal, depositAmount };
}

/** Xác thực warehouseId thuộc org (nếu có). Trả về id hợp lệ hoặc null. */
async function resolveWarehouseId(orgId: string, warehouseId?: string | null): Promise<string | null> {
  if (!warehouseId) return null;
  const w = await prisma.warehouse.findFirst({
    where: { id: warehouseId, orgId, active: true },
    select: { id: true },
  });
  return w?.id ?? null;
}

/** Generate the next sequential code for the current month. Format
 * `NK-YYYYMM-NNN`. Sequential per (orgId, YYYYMM) — multiple orgs can
 * have NK-202605-001 in parallel. */
async function generateImportCode(orgId: string, when = new Date()): Promise<string> {
  const ym = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `NK-${ym}-`;
  const last = await prisma.importOrder.findFirst({
    where: { orgId, importCode: { startsWith: prefix } },
    orderBy: { importCode: 'desc' },
    select: { importCode: true },
  });
  const nextNum = last
    ? parseInt(last.importCode.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

/** Resolve the default warehouse id for an org. Currently single-warehouse
 * (HN). Returns the first active warehouse — caller must throw if null. */
async function getDefaultWarehouseId(orgId: string): Promise<string | null> {
  const w = await prisma.warehouse.findFirst({
    where: { orgId, active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return w?.id ?? null;
}

/** Re-aggregate a product's totalStock + costPrice from its active
 * batches. costPrice = qty-weighted average of importCost across all
 * `active` lots with currentQuantity > 0. Skipped (left as-is) if no
 * active stock — the legacy MISA cost stays authoritative.
 *
 * Quy tắc (anh Philip 25/06/2026): "khi nhập hàng có tồn thì auto bên CRM
 * và Sale hiện ra". Khi totalStock > 0 thì bật hasSales=true để SP xuất
 * hiện trong catalog cả 2 app. CHỈ bật, không bao giờ tắt — SP từng bán
 * (hasSales=true) vẫn hiện kể cả khi bán hết tồn. */
async function syncProductCostAndStock(productId: string): Promise<void> {
  const batches = await prisma.inventoryBatch.findMany({
    where: { productId, status: 'active', currentQuantity: { gt: 0 } },
    select: { currentQuantity: true, importCost: true },
  });
  const totalStock = batches.reduce(
    (s: number, b: { currentQuantity: number }) => s + b.currentQuantity,
    0,
  );
  let costPrice: number | null = null;
  if (batches.length > 0) {
    let costSum = 0;
    let qtySum = 0;
    for (const b of batches) {
      if (b.importCost == null) continue;
      const c = Number(b.importCost);
      costSum += c * b.currentQuantity;
      qtySum += b.currentQuantity;
    }
    if (qtySum > 0) costPrice = costSum / qtySum;
  }
  await prisma.product.update({
    where: { id: productId },
    data: {
      totalStock,
      ...(costPrice !== null ? { costPrice: new Prisma.Decimal(costPrice.toFixed(2)) } : {}),
      // Có tồn → tự hiện trong catalog (cả CRM lẫn Sale app dùng hasSales).
      ...(totalStock > 0 ? { hasSales: true } : {}),
    },
  });
}

function validateItem(it: any, idx: number): string | null {
  if (!it || typeof it !== 'object') return `Item ${idx}: payload không hợp lệ`;
  if (!it.productId) return `Item ${idx}: thiếu productId`;
  if (!it.batchCode || typeof it.batchCode !== 'string' || !it.batchCode.trim()) {
    return `Item ${idx}: thiếu mã lô`;
  }
  if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
    return `Item ${idx}: số lượng phải > 0`;
  }
  if (!Number.isFinite(it.unitCost) || it.unitCost <= 0) {
    return `Item ${idx}: giá nhập phải > 0`;
  }
  if (it.expiryDate && it.manufactureDate) {
    if (new Date(it.expiryDate) <= new Date(it.manufactureDate)) {
      return `Item ${idx}: HSD phải sau ngày sản xuất`;
    }
  }
  return null;
}

function summarizeItems(items: ItemPayload[]): { totalQuantity: number; totalAmount: number } {
  let totalQuantity = 0;
  let totalAmount = 0;
  for (const it of items) {
    totalQuantity += it.quantity;
    totalAmount += it.quantity * it.unitCost;
  }
  return { totalQuantity, totalAmount };
}

export async function importsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/warehouses — list active warehouses (cho dropdown) ─
  // Không nhạy cảm (chỉ tên kho) → mọi user đăng nhập đọc được.
  app.get('/api/v1/warehouses', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const warehouses = await prisma.warehouse.findMany({
        where: { orgId: user.orgId, active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, address: true },
      });
      return { warehouses };
    } catch (err) {
      logger.error('[imports] warehouses error:', err);
      return reply.status(500).send({ error: 'Không tải được danh sách kho' });
    }
  });

  // ── GET /api/v1/imports — list with filters ───────────────────────
  app.get(
    '/api/v1/imports',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const {
          page = '1',
          limit = '50',
          search = '',
          supplierId = '',
          status = '',
          from = '',
          to = '',
        } = request.query as Record<string, string>;

        const where: any = { orgId: user.orgId };
        if (supplierId) where.supplierId = supplierId;
        if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
          where.status = status;
        }
        if (from || to) {
          where.importDate = {};
          if (from) where.importDate.gte = new Date(from);
          if (to) where.importDate.lte = new Date(to);
        }
        if (search) {
          where.OR = [
            { importCode: { contains: search, mode: 'insensitive' } },
            { nccInvoiceNo: { contains: search, mode: 'insensitive' } },
          ];
        }

        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.max(parseInt(limit, 10) || 50, 1);

        const [imports, total] = await Promise.all([
          prisma.importOrder.findMany({
            where,
            include: {
              supplier: { select: { id: true, name: true, country: true } },
              _count: { select: { items: true, batches: true } },
            },
            orderBy: [{ importDate: 'desc' }, { createdAt: 'desc' }],
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
          }),
          prisma.importOrder.count({ where }),
        ]);

        return { imports, total, page: pageNum, limit: limitNum };
      } catch (err) {
        logger.error('[imports] list error:', err);
        return reply.status(500).send({ error: 'Không tải được đơn nhập' });
      }
    },
  );

  // ── GET /api/v1/imports/:id — detail with items ───────────────────
  app.get(
    '/api/v1/imports/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const order = await prisma.importOrder.findFirst({
          where: { id, orgId: user.orgId },
          include: {
            supplier: true,
            items: {
              include: {
                product: {
                  select: { id: true, sku: true, name: true, unit: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
            batches: {
              select: {
                id: true,
                batchCode: true,
                productId: true,
                currentQuantity: true,
                status: true,
              },
            },
          },
        });
        if (!order) return reply.status(404).send({ error: 'Không tìm thấy đơn nhập' });
        return { import: order };
      } catch (err) {
        logger.error('[imports] detail error:', err);
        return reply.status(500).send({ error: 'Không tải được chi tiết' });
      }
    },
  );

  // ── POST /api/v1/imports — create draft ───────────────────────────
  app.post(
    '/api/v1/imports',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = (request.body ?? {}) as CreateImportBody;
        const items = Array.isArray(body.items) ? body.items : [];
        for (let i = 0; i < items.length; i++) {
          const err = validateItem(items[i], i + 1);
          if (err) return reply.status(400).send({ error: err });
        }

        // Verify products belong to this org.
        if (items.length > 0) {
          const productIds = [...new Set(items.map((it) => it.productId))];
          const found = await prisma.product.count({
            where: { orgId: user.orgId, id: { in: productIds } },
          });
          if (found !== productIds.length) {
            return reply.status(400).send({ error: 'Một số SP không tồn tại trong tổ chức' });
          }
        }

        const importCode = await generateImportCode(user.orgId);
        const summary = summarizeItems(items);
        const charges = computeCharges(summary.totalAmount, body);
        const warehouseId = await resolveWarehouseId(user.orgId, body.warehouseId);

        const created = await prisma.importOrder.create({
          data: {
            orgId: user.orgId,
            importCode,
            supplierId: body.supplierId ?? null,
            warehouseId,
            importDate: body.importDate ? new Date(body.importDate) : new Date(),
            nccInvoiceNo: body.nccInvoiceNo ?? null,
            notes: body.notes ?? null,
            attachments: (body.attachments ?? []) as any,
            createdById: user.id,
            totalQuantity: summary.totalQuantity,
            totalAmount: new Prisma.Decimal(summary.totalAmount.toFixed(2)),
            shippingFee: new Prisma.Decimal(charges.shippingFee.toFixed(2)),
            discountType: charges.discountType,
            discountValue: new Prisma.Decimal(charges.discountValue.toFixed(2)),
            discountAmount: new Prisma.Decimal(charges.discountAmount.toFixed(2)),
            vatRate: charges.vatRate,
            vatAmount: new Prisma.Decimal(charges.vatAmount.toFixed(2)),
            grandTotal: new Prisma.Decimal(charges.grandTotal.toFixed(2)),
            depositAmount: new Prisma.Decimal(charges.depositAmount.toFixed(2)),
            items: {
              create: items.map((it) => ({
                productId: it.productId,
                batchCode: it.batchCode.trim(),
                quantity: it.quantity,
                unitCost: new Prisma.Decimal(it.unitCost.toFixed(2)),
                manufactureDate: it.manufactureDate ? new Date(it.manufactureDate) : null,
                expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
                lineTotal: new Prisma.Decimal((it.quantity * it.unitCost).toFixed(2)),
                notes: it.notes ?? null,
              })),
            },
          },
          include: { items: true },
        });
        return reply.status(201).send({ import: created });
      } catch (err) {
        logger.error('[imports] create error:', err);
        return reply.status(500).send({ error: 'Không tạo được đơn nhập' });
      }
    },
  );

  // ── PUT /api/v1/imports/:id — replace draft ───────────────────────
  app.put(
    '/api/v1/imports/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as UpdateImportBody;

        const existing = await prisma.importOrder.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, status: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Không tìm thấy đơn nhập' });
        if (existing.status !== 'draft') {
          return reply.status(400).send({ error: 'Đơn nhập đã xác nhận, không thể sửa' });
        }

        const items = Array.isArray(body.items) ? body.items : [];
        for (let i = 0; i < items.length; i++) {
          const err = validateItem(items[i], i + 1);
          if (err) return reply.status(400).send({ error: err });
        }
        if (items.length > 0) {
          const productIds = [...new Set(items.map((it) => it.productId))];
          const found = await prisma.product.count({
            where: { orgId: user.orgId, id: { in: productIds } },
          });
          if (found !== productIds.length) {
            return reply.status(400).send({ error: 'Một số SP không tồn tại trong tổ chức' });
          }
        }
        const summary = summarizeItems(items);
        const charges = computeCharges(summary.totalAmount, body);
        const warehouseId = await resolveWarehouseId(user.orgId, body.warehouseId);

        const updated = await prisma.$transaction(async (tx: any) => {
          await tx.importOrderItem.deleteMany({ where: { importOrderId: id } });
          return tx.importOrder.update({
            where: { id },
            data: {
              supplierId: body.supplierId ?? null,
              warehouseId,
              importDate: body.importDate ? new Date(body.importDate) : undefined,
              nccInvoiceNo: body.nccInvoiceNo ?? null,
              notes: body.notes ?? null,
              ...(body.attachments !== undefined ? { attachments: body.attachments as any } : {}),
              totalQuantity: summary.totalQuantity,
              totalAmount: new Prisma.Decimal(summary.totalAmount.toFixed(2)),
              shippingFee: new Prisma.Decimal(charges.shippingFee.toFixed(2)),
              discountType: charges.discountType,
              discountValue: new Prisma.Decimal(charges.discountValue.toFixed(2)),
              discountAmount: new Prisma.Decimal(charges.discountAmount.toFixed(2)),
              vatRate: charges.vatRate,
              vatAmount: new Prisma.Decimal(charges.vatAmount.toFixed(2)),
              grandTotal: new Prisma.Decimal(charges.grandTotal.toFixed(2)),
              depositAmount: new Prisma.Decimal(charges.depositAmount.toFixed(2)),
              items: {
                create: items.map((it) => ({
                  productId: it.productId,
                  batchCode: it.batchCode.trim(),
                  quantity: it.quantity,
                  unitCost: new Prisma.Decimal(it.unitCost.toFixed(2)),
                  manufactureDate: it.manufactureDate ? new Date(it.manufactureDate) : null,
                  expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
                  lineTotal: new Prisma.Decimal((it.quantity * it.unitCost).toFixed(2)),
                  notes: it.notes ?? null,
                })),
              },
            },
            include: { items: true },
          });
        });
        return { import: updated };
      } catch (err) {
        logger.error('[imports] update error:', err);
        return reply.status(500).send({ error: 'Không cập nhật được đơn nhập' });
      }
    },
  );

  // ── DELETE /api/v1/imports/:id — only drafts ──────────────────────
  app.delete(
    '/api/v1/imports/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const existing = await prisma.importOrder.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, status: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Không tìm thấy đơn nhập' });
        if (existing.status !== 'draft') {
          return reply.status(400).send({ error: 'Chỉ xoá được đơn nhập ở trạng thái nháp' });
        }
        await prisma.importOrder.delete({ where: { id } });
        return { ok: true };
      } catch (err) {
        logger.error('[imports] delete error:', err);
        return reply.status(500).send({ error: 'Không xoá được đơn nhập' });
      }
    },
  );

  // ── GET /api/v1/imports/:id/warnings ──────────────────────────────
  // Two soft warnings shown to admin BEFORE confirm:
  //   #4 cost_above_price: unitCost > MIN(active product_prices)
  //   #5 price_jump:       unitCost > 1.2 × avg(3 most-recent imports)
  // Pure read-only — never mutates. Returns [] if everything's normal.
  app.get(
    '/api/v1/imports/:id/warnings',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const order = await prisma.importOrder.findFirst({
          where: { id, orgId: user.orgId },
          include: {
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true } },
              },
            },
          },
        });
        if (!order) return reply.status(404).send({ error: 'Không tìm thấy đơn nhập' });

        const warnings: Array<{
          type: 'cost_above_price' | 'price_jump';
          severity: 'high' | 'medium';
          productId: string;
          sku: string;
          productName: string;
          message: string;
        }> = [];

        for (const it of order.items) {
          const sku = it.product?.sku ?? '';
          const name = it.product?.name ?? it.productId;
          const unitCostNum = Number(it.unitCost);

          // #4 cost > min selling price
          const minPriceAgg = await prisma.productPrice.aggregate({
            where: { productId: it.productId, active: true },
            _min: { price: true },
          });
          const minPrice = minPriceAgg._min.price;
          if (minPrice != null && unitCostNum > Number(minPrice)) {
            warnings.push({
              type: 'cost_above_price',
              severity: 'high',
              productId: it.productId,
              sku,
              productName: name,
              message: `${sku} ${name}: Giá vốn ${unitCostNum.toLocaleString('vi-VN')} cao hơn giá bán thấp nhất ${Number(minPrice).toLocaleString('vi-VN')}. Sẽ LỖ nếu áp tier này.`,
            });
          }

          // #5 price jump > 20% vs avg of 3 most-recent CONFIRMED imports
          // for the same product (excluding this draft so editing same
          // order doesn't trigger).
          const recent = await prisma.importOrderItem.findMany({
            where: {
              productId: it.productId,
              importOrderId: { not: order.id },
              importOrder: { orgId: user.orgId, status: 'confirmed' },
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { unitCost: true },
          });
          if (recent.length > 0) {
            const avg =
              recent.reduce(
                (s: number, r: { unitCost: any }) => s + Number(r.unitCost),
                0,
              ) / recent.length;
            if (avg > 0) {
              const pct = ((unitCostNum - avg) / avg) * 100;
              if (pct > 20) {
                warnings.push({
                  type: 'price_jump',
                  severity: 'medium',
                  productId: it.productId,
                  sku,
                  productName: name,
                  message: `${sku} ${name}: Giá nhập ${unitCostNum.toLocaleString('vi-VN')} cao hơn ${pct.toFixed(0)}% so với TB 3 lần nhập gần nhất (${avg.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}). Kiểm tra lại NCC có tăng giá hay nhập sai.`,
                });
              }
            }
          }
        }

        return { warnings };
      } catch (err) {
        logger.error('[imports] warnings error:', err);
        return reply.status(500).send({ error: 'Không tính được cảnh báo' });
      }
    },
  );

  // ── POST /api/v1/imports/:id/confirm ──────────────────────────────
  // Materialise one inventory_batch + one inventory_movement(import) per
  // line item. Idempotency: status check inside the transaction so two
  // concurrent confirms don't both succeed.
  app.post(
    '/api/v1/imports/:id/confirm',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };

        const order = await prisma.importOrder.findFirst({
          where: { id, orgId: user.orgId },
          include: { items: true },
        });
        if (!order) return reply.status(404).send({ error: 'Không tìm thấy đơn nhập' });
        if (order.status !== 'draft') {
          return reply.status(400).send({ error: 'Đơn đã xác nhận trước đó' });
        }
        if (!order.items.length) {
          return reply.status(400).send({ error: 'Đơn nhập chưa có sản phẩm' });
        }

        // Honour the warehouse chosen on the order; fall back to default.
        const warehouseId = order.warehouseId ?? (await getDefaultWarehouseId(user.orgId));
        if (!warehouseId) {
          return reply.status(500).send({ error: 'Không tìm thấy kho mặc định' });
        }

        // Tiền cần thanh toán: ưu tiên grandTotal (đơn POS mới); fallback
        // totalAmount cho draft cũ tạo trước khi có mô hình phí/VAT.
        const payable =
          Number(order.grandTotal) > 0 ? Number(order.grandTotal) : Number(order.totalAmount);
        const deposit = Math.min(Math.max(0, Number(order.depositAmount)), payable);
        // Đặt cọc phải trả cho 1 NCC cụ thể (bút toán SupplierPayment yêu cầu supplierId).
        if (deposit > 0 && !order.supplierId) {
          return reply.status(400).send({
            error: 'Đơn có đặt cọc nhưng chưa chọn NCC — không ghi nhận được cọc.',
          });
        }

        // Pre-flight: detect (productId, batchCode) collisions against
        // existing batches BEFORE we open the write transaction. This is
        // also enforced by the unique index — surfacing a clean error.
        const collisions = await prisma.inventoryBatch.findMany({
          where: {
            orgId: user.orgId,
            OR: order.items.map((it: { productId: string; batchCode: string }) => ({
              productId: it.productId,
              batchCode: it.batchCode,
            })),
          },
          select: { batchCode: true, productId: true },
        });
        if (collisions.length > 0) {
          const codes = collisions.map((c: { batchCode: string }) => c.batchCode).join(', ');
          return reply.status(400).send({
            error: `Mã lô đã tồn tại trong kho: ${codes}. Hãy đổi mã lô khác.`,
          });
        }

        const result = await prisma.$transaction(async (tx: any) => {
          // Re-check status under the lock to defeat double-confirm.
          const fresh = await tx.importOrder.findUnique({
            where: { id },
            select: { status: true },
          });
          if (!fresh || fresh.status !== 'draft') {
            throw new Error('CONCURRENT_CONFIRM');
          }

          const createdBatchIds: string[] = [];
          for (const it of order.items) {
            const batch = await tx.inventoryBatch.create({
              data: {
                orgId: user.orgId,
                productId: it.productId,
                warehouseId,
                batchCode: it.batchCode,
                manufactureDate: it.manufactureDate,
                expiryDate: it.expiryDate,
                importQuantity: it.quantity,
                currentQuantity: it.quantity,
                importCost: it.unitCost,
                supplierId: order.supplierId,
                importOrderId: order.id,
                createdById: user.id,
                notes: it.notes,
              },
            });
            await tx.inventoryMovement.create({
              data: {
                orgId: user.orgId,
                productId: it.productId,
                batchId: batch.id,
                type: 'import',
                quantity: it.quantity,
                referenceType: 'import_order',
                referenceId: order.id,
                note: `Nhập kho ${order.importCode} — lô ${it.batchCode}`,
                createdById: user.id,
              },
            });
            createdBatchIds.push(batch.id);
          }

          // Calculate payment due date from supplier's payment terms
          let paymentDueDate: Date | null = null;
          if (order.supplierId) {
            const supplier = await tx.supplier.findUnique({
              where: { id: order.supplierId },
              select: { paymentTermDays: true },
            });
            if (supplier) {
              const importDate = order.importDate ?? new Date();
              paymentDueDate = new Date(importDate);
              paymentDueDate.setDate(paymentDueDate.getDate() + supplier.paymentTermDays);
            }
          }

          // ── Đặt cọc → tạo bút toán thanh toán NCC (để công nợ khớp) ──
          const debt = Math.max(0, payable - deposit);
          const paymentStatus = debt <= 0 ? 'paid' : deposit > 0 ? 'partial' : 'unpaid';
          if (deposit > 0 && order.supplierId) {
            await tx.supplierPayment.create({
              data: {
                orgId: user.orgId,
                importOrderId: order.id,
                supplierId: order.supplierId,
                amount: new Prisma.Decimal(deposit.toFixed(2)),
                paymentMethod: 'bank_transfer',
                paymentDate: order.importDate ?? new Date(),
                note: `Đặt cọc khi nhập ${order.importCode}`,
                createdById: user.id,
              },
            });
          }

          await tx.importOrder.update({
            where: { id },
            data: {
              status: 'confirmed',
              confirmedAt: new Date(),
              // ── Auto-set công nợ NCC khi confirm (theo cần thanh toán − cọc) ──
              debtAmount: new Prisma.Decimal(debt.toFixed(2)),
              paidAmount: new Prisma.Decimal(deposit.toFixed(2)),
              paymentStatus,
              paymentDueDate,
            },
          });
          return { batchIds: createdBatchIds };
        });

        // Sync product totals + cost price OUTSIDE the txn (multiple
        // products affected; failure here doesn't have to roll back the
        // import — the next confirm/adjust will re-sync).
        const productIds = [...new Set(order.items.map((it: { productId: string }) => it.productId))] as string[];
        for (const pid of productIds) {
          await syncProductCostAndStock(pid);
        }

        return { ok: true, batchesCreated: result.batchIds.length };
      } catch (err: any) {
        if (err?.message === 'CONCURRENT_CONFIRM') {
          return reply.status(409).send({ error: 'Đơn vừa được xác nhận bởi người khác' });
        }
        logger.error('[imports] confirm error:', err);
        return reply.status(500).send({ error: 'Không xác nhận được đơn nhập' });
      }
    },
  );

  // ── POST /api/v1/imports/parse-excel ──────────────────────────────
  // Receives a multipart upload (single .xlsx file) and returns a
  // preview { rows: [...], errors: [...] }. The frontend then lets the
  // user confirm before calling POST /api/v1/imports with the rows.
  // Expected columns (header row 1, data starting row 2):
  //   SKU | Tên SP | SL | Giá nhập | Mã lô | NSX | HSD | Ghi chú
  app.post(
    '/api/v1/imports/parse-excel',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const file = await (request as any).file?.();
        if (!file) {
          return reply.status(400).send({ error: 'Thiếu file Excel' });
        }
        const buffer = await file.toBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) {
          return reply.status(400).send({ error: 'File Excel không có sheet' });
        }

        // Build a SKU → product map once.
        const products = await prisma.product.findMany({
          where: { orgId: user.orgId },
          select: { id: true, sku: true, name: true },
        });
        const skuMap = new Map<string, { id: string; sku: string; name: string }>(
          products.map((p: { id: string; sku: string; name: string }) => [p.sku, p]),
        );

        type Row = {
          rowNum: number;
          sku: string;
          productId: string | null;
          productName: string;
          quantity: number;
          unitCost: number;
          batchCode: string;
          manufactureDate: string | null;
          expiryDate: string | null;
          notes: string | null;
        };
        const rows: Row[] = [];
        const errors: Array<{ rowNum: number; message: string }> = [];

        sheet.eachRow((row, rowNum) => {
          if (rowNum === 1) return; // skip header
          const sku = String(row.getCell(1).value ?? '').trim();
          const productName = String(row.getCell(2).value ?? '').trim();
          const qtyRaw = row.getCell(3).value;
          const costRaw = row.getCell(4).value;
          const batchCode = String(row.getCell(5).value ?? '').trim();
          const mfgRaw = row.getCell(6).value;
          const expRaw = row.getCell(7).value;
          const notes = String(row.getCell(8).value ?? '').trim() || null;

          if (!sku && !productName && !qtyRaw && !costRaw && !batchCode) return;

          const quantity = Number(qtyRaw);
          const unitCost = Number(costRaw);
          const product = sku ? skuMap.get(sku) : undefined;
          const mfg = mfgRaw instanceof Date ? mfgRaw.toISOString().slice(0, 10) : null;
          const exp = expRaw instanceof Date ? expRaw.toISOString().slice(0, 10) : null;

          if (!sku) errors.push({ rowNum, message: 'Thiếu SKU' });
          else if (!product) errors.push({ rowNum, message: `SKU "${sku}" không tồn tại` });
          if (!batchCode) errors.push({ rowNum, message: 'Thiếu mã lô' });
          if (!Number.isFinite(quantity) || quantity <= 0) {
            errors.push({ rowNum, message: 'Số lượng phải > 0' });
          }
          if (!Number.isFinite(unitCost) || unitCost <= 0) {
            errors.push({ rowNum, message: 'Giá nhập phải > 0' });
          }
          if (mfg && exp && new Date(exp) <= new Date(mfg)) {
            errors.push({ rowNum, message: 'HSD phải sau NSX' });
          }
          rows.push({
            rowNum,
            sku,
            productId: product?.id ?? null,
            productName: product?.name ?? productName,
            quantity,
            unitCost,
            batchCode,
            manufactureDate: mfg,
            expiryDate: exp,
            notes,
          });
        });

        return {
          rows,
          errors,
          summary: {
            totalRows: rows.length,
            errorRows: new Set(errors.map((e) => e.rowNum)).size,
          },
        };
      } catch (err) {
        logger.error('[imports] parse-excel error:', err);
        return reply.status(500).send({ error: 'Không đọc được file Excel' });
      }
    },
  );
}
