/**
 * Sale-app product editing — media + marketing docs.
 *
 * Mirrors the owner/admin-only endpoints in products/product-routes.ts but
 * is intentionally NOT role-gated: sale (member) users edit product media and
 * attach marketing material directly from the sale-app. Org scoping is still
 * enforced (a user can only touch products in their own org).
 *
 *  PUT    /api/v1/sale-app/products/:id/media               → main image + gallery (≤4)
 *  POST   /api/v1/sale-app/products/:id/marketing-docs      → append a doc (category-tagged)
 *  DELETE /api/v1/sale-app/products/:id/marketing-docs/:docId → remove a doc
 *
 * Marketing docs are stored as a Json array on the product row — each item is
 * { id, category, type, name, driveUrl, createdAt }. We never download/proxy
 * the file; the UI opens driveUrl in a new tab.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { reqUser, toNumber } from '../orders/order-service.js';

const VALID_DOC_TYPES = ['pdf', 'doc', 'image', 'video', 'text', 'link'];
const VALID_DOC_CATEGORIES = ['catalog', 'price_policy', 'product_photos', 'cbsp', 'sales_material'];

function isHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function productEditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── POST /api/v1/sale-app/products ─ ADMIN ONLY — tạo sản phẩm mới ────
  // Tạo 1 sản phẩm rồi gắn sẵn 4 bậc giá theo thùng (10/5/1/<1 thùng) —
  // đúng convention của catalog + màn Chỉnh sửa. Nếu có nhập "giá niêm yết"
  // thì cả 4 bậc để chung mức đó (admin tinh chỉnh lại từng bậc sau).
  app.post('/api/v1/sale-app/products', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ admin được thêm sản phẩm' });
      }
      const body = request.body as {
        sku?: string;
        name?: string;
        brandId?: string | null;
        packageSize?: string | null;
        price?: number | null;
      };

      const sku = (body.sku || '').trim();
      const name = (body.name || '').trim();
      if (!sku || !name) {
        return reply.status(400).send({ error: 'Mã SP (SKU) và tên sản phẩm là bắt buộc' });
      }

      let price = 0;
      if (body.price !== undefined && body.price !== null && body.price !== ('' as any)) {
        const n = Math.round(Number(body.price));
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'Giá phải là số nguyên ≥ 0 (đồng)' });
        }
        price = n;
      }

      const clash = await prisma.product.findFirst({
        where: { orgId: user.orgId, sku },
        select: { id: true },
      });
      if (clash) return reply.status(400).send({ error: 'Mã SP (SKU) đã tồn tại trong tổ chức' });

      let brandId: string | null = null;
      if (body.brandId) {
        const brand = await prisma.brand.findFirst({
          where: { id: body.brandId, orgId: user.orgId },
          select: { id: true },
        });
        if (!brand) return reply.status(400).send({ error: 'Thương hiệu không hợp lệ' });
        brandId = brand.id;
      }

      const created = await prisma.product.create({
        data: {
          orgId: user.orgId,
          sku,
          name,
          brandId,
          packageSize: (body.packageSize || '').trim() || null,
          status: 'active',
          sellable: true,
          hasSales: true, // hiện luôn trong catalog + tìm kiếm lên đơn
          marketingDocs: [],
          createdById: user.id,
          updatedById: user.id,
        },
        select: { id: true },
      });

      // 4 bậc giá theo thùng — khớp POST /_backfill-tier-prices
      const tierDefs = [
        { tierName: '10 thùng', displayOrder: 1, isDefault: false },
        { tierName: '5 thùng', displayOrder: 2, isDefault: false },
        { tierName: '1 thùng', displayOrder: 3, isDefault: true },
        { tierName: '<1 thùng', displayOrder: 4, isDefault: false },
      ];
      await prisma.productPrice.createMany({
        data: tierDefs.map((t) => ({
          productId: created.id,
          tierName: t.tierName,
          price,
          active: true,
          displayOrder: t.displayOrder,
          isDefault: t.isDefault,
        })),
      });

      const full = await prisma.product.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          sku: true,
          name: true,
          brand: { select: { id: true, name: true } },
        },
      });
      return reply.status(201).send({ product: full });
    } catch (err) {
      logger.error('[sale-app] product create error:', err);
      return reply.status(500).send({ error: 'Lỗi tạo sản phẩm' });
    }
  });

  // ── PUT /api/v1/sale-app/products/:id/media ───────────────────────────
  // Updates ONLY mainImageUrl + galleryUrls. Gallery is capped at 4 images.
  // mainImageUrl null/'' clears the cover image.
  app.put('/api/v1/sale-app/products/:id/media', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as { mainImageUrl?: string | null; galleryUrls?: string[] };

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

      const data: any = {};

      if (body.mainImageUrl !== undefined) {
        const v = body.mainImageUrl;
        if (v === null || (typeof v === 'string' && v.trim() === '')) {
          data.mainImageUrl = null;
        } else if (isHttpUrl(v)) {
          data.mainImageUrl = v.trim();
        } else {
          return reply.status(400).send({ error: 'Ảnh đại diện phải là link http/https' });
        }
      }

      if (body.galleryUrls !== undefined) {
        if (!Array.isArray(body.galleryUrls)) {
          return reply.status(400).send({ error: 'Danh sách ảnh phụ không hợp lệ' });
        }
        if (body.galleryUrls.length > 4) {
          return reply.status(400).send({ error: 'Tối đa 4 ảnh phụ' });
        }
        for (const u of body.galleryUrls) {
          if (!isHttpUrl(u)) {
            return reply.status(400).send({ error: 'Ảnh phụ phải là link http/https' });
          }
        }
        data.galleryUrls = body.galleryUrls.map((u: string) => u.trim());
      }

      const updated = await prisma.product.update({
        where: { id },
        data,
        select: { mainImageUrl: true, galleryUrls: true },
      });

      return { mainImageUrl: updated.mainImageUrl, galleryUrls: updated.galleryUrls };
    } catch (err) {
      logger.error('[sale-app] product media update error:', err);
      return reply.status(500).send({ error: 'Lỗi cập nhật ảnh sản phẩm' });
    }
  });

  // ── POST /api/v1/sale-app/products/:id/marketing-docs ─────────────────
  app.post('/api/v1/sale-app/products/:id/marketing-docs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as { category?: string; name?: string; driveUrl?: string; type?: string };

      if (!body.category || !VALID_DOC_CATEGORIES.includes(body.category)) {
        return reply.status(400).send({
          error: `Danh mục tài liệu phải là 1 trong: ${VALID_DOC_CATEGORIES.join(', ')}`,
        });
      }
      if (!body.name?.trim()) {
        return reply.status(400).send({ error: 'Tên tài liệu là bắt buộc' });
      }
      if (!isHttpUrl(body.driveUrl)) {
        return reply.status(400).send({ error: 'URL không hợp lệ — phải là link http/https' });
      }
      const type = body.type ?? 'link';
      if (!VALID_DOC_TYPES.includes(type)) {
        return reply.status(400).send({
          error: `Loại tài liệu phải là 1 trong: ${VALID_DOC_TYPES.join(', ')}`,
        });
      }

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, marketingDocs: true },
      });
      if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

      const docs = Array.isArray(product.marketingDocs) ? [...(product.marketingDocs as any[])] : [];
      const doc = {
        id: randomUUID(),
        category: body.category,
        type,
        name: body.name.trim(),
        driveUrl: body.driveUrl!.trim(),
        createdAt: new Date().toISOString(),
      };
      docs.push(doc);

      await prisma.product.update({
        where: { id },
        data: { marketingDocs: docs },
      });

      return reply.status(201).send({ doc, marketingDocs: docs });
    } catch (err) {
      logger.error('[sale-app] product marketing-docs add error:', err);
      return reply.status(500).send({ error: 'Lỗi thêm tài liệu marketing' });
    }
  });

  // ── DELETE /api/v1/sale-app/products/:id/marketing-docs/:docId ────────
  app.delete(
    '/api/v1/sale-app/products/:id/marketing-docs/:docId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const { id, docId } = request.params as { id: string; docId: string };

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, marketingDocs: true },
        });
        if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

        const docs = Array.isArray(product.marketingDocs) ? (product.marketingDocs as any[]) : [];
        const filtered = docs.filter((d) => d?.id !== docId);
        if (filtered.length === docs.length) {
          return reply.status(404).send({ error: 'Không tìm thấy tài liệu' });
        }

        await prisma.product.update({
          where: { id },
          data: { marketingDocs: filtered },
        });

        return { marketingDocs: filtered };
      } catch (err) {
        logger.error('[sale-app] product marketing-docs delete error:', err);
        return reply.status(500).send({ error: 'Lỗi xoá tài liệu marketing' });
      }
    },
  );

  // ── PUT /api/v1/sale-app/products/:id/description ─────────────────────
  // Sale (member) + admin can edit. Trim; '' or null clears the description.
  app.put('/api/v1/sale-app/products/:id/description', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as { description?: string | null };

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

      let description: string | null = null;
      if (typeof body.description === 'string') {
        const trimmed = body.description.trim();
        description = trimmed === '' ? null : trimmed;
      }

      const updated = await prisma.product.update({
        where: { id },
        data: { description },
        select: { description: true },
      });

      return { description: updated.description };
    } catch (err) {
      logger.error('[sale-app] product description update error:', err);
      return reply.status(500).send({ error: 'Lỗi cập nhật mô tả sản phẩm' });
    }
  });

  // ── PUT /api/v1/sale-app/products/:id/prices ─ ADMIN ONLY ─────────────
  // Upsert active ProductPrice rows by (productId, tierName).
  app.put('/api/v1/sale-app/products/:id/prices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ admin được sửa giá' });
      }
      const { id } = request.params as { id: string };
      const body = request.body as { prices?: Array<{ tierName?: string; price?: number }> };

      if (!Array.isArray(body.prices) || body.prices.length === 0) {
        return reply.status(400).send({ error: 'Danh sách giá không hợp lệ' });
      }
      for (const row of body.prices) {
        if (!row.tierName || typeof row.tierName !== 'string' || !row.tierName.trim()) {
          return reply.status(400).send({ error: 'Tên bậc giá là bắt buộc' });
        }
        if (
          typeof row.price !== 'number' ||
          !Number.isInteger(row.price) ||
          row.price < 0
        ) {
          return reply.status(400).send({ error: 'Giá phải là số nguyên ≥ 0 (đồng)' });
        }
      }

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

      for (const row of body.prices) {
        const tierName = row.tierName!.trim();
        const price = row.price!;
        let existing = await prisma.productPrice.findFirst({
          where: { productId: id, tierName, active: true },
          select: { id: true },
        });
        // Retail fallback: avoid creating a duplicate "lẻ" tier when the
        // product already has one under a slightly different name
        // (e.g. "Giá lẻ niêm yết" vs "Lẻ niêm yết").
        if (!existing && /lẻ|le|retail/i.test(tierName)) {
          const retailRows = await prisma.productPrice.findMany({
            where: { productId: id, active: true },
            select: { id: true, tierName: true, displayOrder: true },
            orderBy: { displayOrder: 'asc' },
          });
          const match = retailRows.find((r: any) => /lẻ|le|retail/i.test(r.tierName));
          if (match) existing = { id: match.id };
        }
        if (existing) {
          await prisma.productPrice.update({
            where: { id: existing.id },
            data: { price },
          });
        } else {
          const maxRow = await prisma.productPrice.aggregate({
            where: { productId: id },
            _max: { displayOrder: true },
          });
          const nextOrder = (maxRow._max.displayOrder ?? 0) + 1;
          await prisma.productPrice.create({
            data: {
              productId: id,
              tierName,
              price,
              active: true,
              displayOrder: nextOrder,
              isDefault: false,
            },
          });
        }
      }

      const tiers = await prisma.productPrice.findMany({
        where: { productId: id, active: true },
        select: { id: true, tierName: true, price: true, isDefault: true },
        orderBy: { displayOrder: 'asc' },
      });

      return {
        tiers: tiers.map((t: any) => ({
          id: t.id,
          name: t.tierName,
          price: toNumber(t.price),
          isDefault: t.isDefault,
        })),
      };
    } catch (err) {
      logger.error('[sale-app] product prices update error:', err);
      return reply.status(500).send({ error: 'Lỗi cập nhật giá sản phẩm' });
    }
  });

  // ── POST /api/v1/sale-app/products/:id/sync-price-fifo ─ ADMIN ONLY ───
  // Suggests tier prices from the earliest active batch's import cost.
  // Returns suggestions ONLY — does NOT persist. Admin saves via /prices.
  app.post('/api/v1/sale-app/products/:id/sync-price-fifo', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ admin được sửa giá' });
      }
      const { id } = request.params as { id: string };

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

      const batch = await prisma.inventoryBatch.findFirst({
        where: { productId: id, status: 'active', currentQuantity: { gt: 0 } },
        orderBy: { expiryDate: 'asc' },
        select: { importCost: true },
      });
      if (!batch || batch.importCost == null) {
        return reply.status(400).send({ error: 'Chưa có lô tồn để tính giá vốn FIFO' });
      }

      const cfg = await prisma.saleAppPricingConfig.findUnique({
        where: { orgId: user.orgId },
        select: { costMarkupPct: true, tierDelta: true },
      });
      const markup = cfg ? toNumber(cfg.costMarkupPct) : 25;
      const delta = cfg ? toNumber(cfg.tierDelta) : 5000;

      const fifoCost = toNumber(batch.importCost);
      const base = Math.round(fifoCost * (1 + markup / 100));

      return {
        fifo_cost: Math.round(fifoCost),
        markup_pct: markup,
        tier_delta: delta,
        suggestions: [
          { tierName: '<1 thùng', price: base + delta * 3 },
          { tierName: '1 thùng', price: base + delta * 1 },
          { tierName: '5 thùng', price: base },
        ],
      };
    } catch (err) {
      logger.error('[sale-app] product sync-price-fifo error:', err);
      return reply.status(500).send({ error: 'Lỗi tính giá vốn FIFO' });
    }
  });
}
