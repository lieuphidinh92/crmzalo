/**
 * Product CRUD + nested price-tier and marketing-docs endpoints.
 *
 * Permission rules:
 *   - List/detail: any authenticated user in the org
 *   - Create/update/delete: owner | admin only
 *   - `costPrice` (giá vốn) is stripped from responses for member role
 *   - On create, 4 default tiers are auto-attached (CTV / Đại lý 1 /
 *     Đại lý 2 VIP / Giá lẻ niêm yết). Admin can later add/remove/rename
 *     tiers via the price-tier endpoints.
 *
 * Marketing docs are stored as a Json array on the product row — each item
 * is { id, type, name, driveUrl, createdAt }. We never download or proxy
 * the file; the UI opens the Drive URL in a new tab.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { ensureProductSeeds, buildDefaultTiers } from './product-seeds.js';

type ProductWithPrices = {
  id: string;
  costPrice: unknown;
  prices?: Array<{ id: string; price: unknown; isDefault: boolean; tierName: string; displayOrder: number; active: boolean }>;
  [k: string]: unknown;
};

const VALID_DOC_TYPES = ['pdf', 'doc', 'image', 'video', 'text', 'link'];

function canSeeCost(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function stripCost<T extends ProductWithPrices>(p: T, role: string): T {
  if (canSeeCost(role)) return p;
  return { ...p, costPrice: null };
}

function isValidDriveUrl(url: string): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return true;
  } catch {
    return false;
  }
}

export async function productRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/products ─ list with filters + seed-on-first-use ────────
  app.get('/api/v1/products', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      // Idempotent — seeds only run once per org per process
      await ensureProductSeeds(user.orgId);

      const {
        page = '1',
        limit = '50',
        search = '',
        brandId = '',
        status = '',
        stock = '',
      } = request.query as Record<string, string>;

      const where: any = { orgId: user.orgId };
      if (brandId) {
        where.brandId = { in: brandId.split(',').filter(Boolean) };
      }
      if (status) {
        where.status = { in: status.split(',').filter(Boolean) };
      }
      if (search) {
        where.OR = [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Stock filter relies on a comparison with warningStock — we evaluate
      // it post-fetch because Prisma can't compare two columns directly in
      // a where clause without raw SQL.
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

      const [productsRaw, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            brand: { select: { id: true, name: true } },
            prices: {
              where: { active: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: [{ updatedAt: 'desc' }],
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.product.count({ where }),
      ]);

      let products = productsRaw.map((p: any) => stripCost(p, user.role));

      if (stock === 'in_stock') {
        products = products.filter((p: any) => p.totalStock > p.warningStock);
      } else if (stock === 'low') {
        products = products.filter(
          (p: any) => p.totalStock > 0 && p.totalStock <= p.warningStock,
        );
      } else if (stock === 'out') {
        products = products.filter((p: any) => p.totalStock === 0);
      }

      return { products, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[products] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch products' });
    }
  });

  // ── GET /api/v1/products/:id ─ detail ──────────────────────────────────
  app.get('/api/v1/products/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          brand: { select: { id: true, name: true, supplierId: true } },
          prices: {
            where: { active: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });

      if (!product) return reply.status(404).send({ error: 'Product not found' });
      return stripCost(product, user.role);
    } catch (err) {
      logger.error('[products] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch product' });
    }
  });

  // ── POST /api/v1/products ─ admin only ─────────────────────────────────
  app.post(
    '/api/v1/products',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = request.body as Record<string, any>;

        if (!body.sku || !body.name) {
          return reply.status(400).send({ error: 'SKU và tên sản phẩm là bắt buộc' });
        }

        const skuClash = await prisma.product.findFirst({
          where: { orgId: user.orgId, sku: body.sku },
          select: { id: true },
        });
        if (skuClash) {
          return reply.status(400).send({ error: 'SKU đã tồn tại trong tổ chức' });
        }

        const created = await prisma.product.create({
          data: {
            orgId: user.orgId,
            sku: body.sku,
            name: body.name,
            brandId: body.brandId ?? null,
            packageSize: body.packageSize ?? null,
            mainImageUrl: body.mainImageUrl ?? null,
            galleryUrls: Array.isArray(body.galleryUrls) ? body.galleryUrls : [],
            status: body.status ?? 'active',
            mainUse: body.mainUse ?? null,
            targetAudience: body.targetAudience ?? null,
            usageMethod: body.usageMethod ?? null,
            shelfLifeMonths: body.shelfLifeMonths ?? null,
            registrationNumber: body.registrationNumber ?? null,
            warningStock: body.warningStock ?? 30,
            unit: body.unit ?? 'hộp',
            costPrice: body.costPrice ?? null,
            marketingDocs: [],
            createdById: user.id,
            updatedById: user.id,
          },
        });

        // Auto-attach 4 default tiers
        await prisma.productPrice.createMany({
          data: buildDefaultTiers().map((t) => ({
            productId: created.id,
            tierName: t.tierName,
            price: t.price,
            displayOrder: t.displayOrder,
            isDefault: t.isDefault,
          })),
        });

        const full = await prisma.product.findUnique({
          where: { id: created.id },
          include: {
            brand: { select: { id: true, name: true } },
            prices: { where: { active: true }, orderBy: { displayOrder: 'asc' } },
          },
        });
        return reply.status(201).send(stripCost(full as ProductWithPrices, user.role));
      } catch (err) {
        logger.error('[products] Create error:', err);
        return reply.status(500).send({ error: 'Failed to create product' });
      }
    },
  );

  // ── PUT /api/v1/products/:id ─ admin only ──────────────────────────────
  app.put(
    '/api/v1/products/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as Record<string, any>;

        const existing = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, sku: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Product not found' });

        if (body.sku && body.sku !== existing.sku) {
          const clash = await prisma.product.findFirst({
            where: { orgId: user.orgId, sku: body.sku, NOT: { id } },
            select: { id: true },
          });
          if (clash) return reply.status(400).send({ error: 'SKU đã tồn tại trong tổ chức' });
        }

        const updateData: any = { updatedById: user.id };
        const fields = [
          'sku', 'name', 'brandId', 'packageSize', 'mainImageUrl',
          'galleryUrls', 'status', 'mainUse', 'targetAudience',
          'usageMethod', 'shelfLifeMonths', 'registrationNumber',
          'warningStock', 'unit', 'costPrice',
        ];
        for (const f of fields) {
          if (body[f] !== undefined) updateData[f] = body[f];
        }

        const updated = await prisma.product.update({
          where: { id },
          data: updateData,
          include: {
            brand: { select: { id: true, name: true } },
            prices: { where: { active: true }, orderBy: { displayOrder: 'asc' } },
          },
        });
        return stripCost(updated as ProductWithPrices, user.role);
      } catch (err) {
        logger.error('[products] Update error:', err);
        return reply.status(500).send({ error: 'Failed to update product' });
      }
    },
  );

  // ── DELETE /api/v1/products/:id ─ soft delete via status flag ─────────
  app.delete(
    '/api/v1/products/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const existing = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Product not found' });
        await prisma.product.update({
          where: { id },
          data: { status: 'discontinued', updatedById: user.id },
        });
        return { success: true };
      } catch (err) {
        logger.error('[products] Delete error:', err);
        return reply.status(500).send({ error: 'Failed to delete product' });
      }
    },
  );

  // ── Marketing docs ─────────────────────────────────────────────────────
  // POST /api/v1/products/:id/marketing-docs — append new link doc
  app.post(
    '/api/v1/products/:id/marketing-docs',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as { type?: string; name?: string; driveUrl?: string };

        if (!body.type || !VALID_DOC_TYPES.includes(body.type)) {
          return reply.status(400).send({
            error: `Loại tài liệu phải là 1 trong: ${VALID_DOC_TYPES.join(', ')}`,
          });
        }
        if (!body.name?.trim()) {
          return reply.status(400).send({ error: 'Tên tài liệu là bắt buộc' });
        }
        if (!body.driveUrl || !isValidDriveUrl(body.driveUrl)) {
          return reply.status(400).send({ error: 'URL không hợp lệ — phải là link http/https' });
        }

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, marketingDocs: true },
        });
        if (!product) return reply.status(404).send({ error: 'Product not found' });

        const docs = Array.isArray(product.marketingDocs) ? [...(product.marketingDocs as any[])] : [];
        const newDoc = {
          id: randomUUID(),
          type: body.type,
          name: body.name.trim(),
          driveUrl: body.driveUrl.trim(),
          createdAt: new Date().toISOString(),
        };
        docs.push(newDoc);

        await prisma.product.update({
          where: { id },
          data: { marketingDocs: docs, updatedById: user.id },
        });
        return reply.status(201).send(newDoc);
      } catch (err) {
        logger.error('[products] Add doc error:', err);
        return reply.status(500).send({ error: 'Failed to add marketing doc' });
      }
    },
  );

  // DELETE /api/v1/products/:id/marketing-docs/:docId
  app.delete(
    '/api/v1/products/:id/marketing-docs/:docId',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id, docId } = request.params as { id: string; docId: string };

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, marketingDocs: true },
        });
        if (!product) return reply.status(404).send({ error: 'Product not found' });

        const docs = Array.isArray(product.marketingDocs) ? (product.marketingDocs as any[]) : [];
        const filtered = docs.filter((d) => d?.id !== docId);
        if (filtered.length === docs.length) {
          return reply.status(404).send({ error: 'Doc not found' });
        }

        await prisma.product.update({
          where: { id },
          data: { marketingDocs: filtered, updatedById: user.id },
        });
        return { success: true };
      } catch (err) {
        logger.error('[products] Delete doc error:', err);
        return reply.status(500).send({ error: 'Failed to delete marketing doc' });
      }
    },
  );

  // ── Price tiers ────────────────────────────────────────────────────────
  // GET /api/v1/products/:id/prices
  app.get('/api/v1/products/:id/prices', async (request, reply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!product) return reply.status(404).send({ error: 'Product not found' });

      const prices = await prisma.productPrice.findMany({
        where: { productId: id, active: true },
        orderBy: { displayOrder: 'asc' },
      });
      return { prices };
    } catch (err) {
      logger.error('[products] List prices error:', err);
      return reply.status(500).send({ error: 'Failed to list prices' });
    }
  });

  // POST /api/v1/products/:id/prices — add new tier
  app.post(
    '/api/v1/products/:id/prices',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as { tierName?: string; price?: number; displayOrder?: number; isDefault?: boolean };

        if (!body.tierName?.trim()) {
          return reply.status(400).send({ error: 'Tên mức giá là bắt buộc' });
        }
        if (body.price === undefined || body.price === null || isNaN(Number(body.price)) || Number(body.price) < 0) {
          return reply.status(400).send({ error: 'Giá phải là số ≥ 0' });
        }

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!product) return reply.status(404).send({ error: 'Product not found' });

        const last = await prisma.productPrice.findFirst({
          where: { productId: id, active: true },
          orderBy: { displayOrder: 'desc' },
          select: { displayOrder: true },
        });
        const nextOrder = body.displayOrder ?? (last ? last.displayOrder + 1 : 1);

        // If this tier is being marked default, clear others
        if (body.isDefault === true) {
          await prisma.productPrice.updateMany({
            where: { productId: id, active: true },
            data: { isDefault: false },
          });
        }

        const created = await prisma.productPrice.create({
          data: {
            productId: id,
            tierName: body.tierName.trim(),
            price: body.price,
            displayOrder: nextOrder,
            isDefault: body.isDefault === true,
          },
        });
        return reply.status(201).send(created);
      } catch (err) {
        logger.error('[products] Create price error:', err);
        return reply.status(500).send({ error: 'Failed to create price tier' });
      }
    },
  );

  // PUT /api/v1/products/:id/prices/:priceId — edit name / price / order
  app.put(
    '/api/v1/products/:id/prices/:priceId',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id, priceId } = request.params as { id: string; priceId: string };
        const body = request.body as { tierName?: string; price?: number; displayOrder?: number };

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!product) return reply.status(404).send({ error: 'Product not found' });

        const existing = await prisma.productPrice.findFirst({
          where: { id: priceId, productId: id },
          select: { id: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Price tier not found' });

        const data: any = {};
        if (body.tierName !== undefined) {
          if (!body.tierName.trim()) {
            return reply.status(400).send({ error: 'Tên mức giá không được rỗng' });
          }
          data.tierName = body.tierName.trim();
        }
        if (body.price !== undefined) {
          if (isNaN(Number(body.price)) || Number(body.price) < 0) {
            return reply.status(400).send({ error: 'Giá phải là số ≥ 0' });
          }
          data.price = body.price;
        }
        if (body.displayOrder !== undefined) data.displayOrder = body.displayOrder;

        const updated = await prisma.productPrice.update({
          where: { id: priceId },
          data,
        });
        return updated;
      } catch (err) {
        logger.error('[products] Update price error:', err);
        return reply.status(500).send({ error: 'Failed to update price tier' });
      }
    },
  );

  // PUT /api/v1/products/:id/prices/:priceId/set-default — atomic flip
  app.put(
    '/api/v1/products/:id/prices/:priceId/set-default',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id, priceId } = request.params as { id: string; priceId: string };

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!product) return reply.status(404).send({ error: 'Product not found' });

        const target = await prisma.productPrice.findFirst({
          where: { id: priceId, productId: id, active: true },
          select: { id: true },
        });
        if (!target) return reply.status(404).send({ error: 'Price tier not found' });

        await prisma.$transaction([
          prisma.productPrice.updateMany({
            where: { productId: id, active: true },
            data: { isDefault: false },
          }),
          prisma.productPrice.update({
            where: { id: priceId },
            data: { isDefault: true },
          }),
        ]);
        return { success: true };
      } catch (err) {
        logger.error('[products] Set default price error:', err);
        return reply.status(500).send({ error: 'Failed to set default tier' });
      }
    },
  );

  // PUT /api/v1/products/:id/prices/reorder — bulk reorder via drag-drop
  app.put(
    '/api/v1/products/:id/prices/reorder',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as { order?: string[] };

        if (!Array.isArray(body.order)) {
          return reply.status(400).send({ error: 'order must be an array of priceIds' });
        }

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!product) return reply.status(404).send({ error: 'Product not found' });

        await prisma.$transaction(
          body.order.map((priceId, idx) =>
            prisma.productPrice.updateMany({
              where: { id: priceId, productId: id },
              data: { displayOrder: idx + 1 },
            }),
          ),
        );
        return { success: true };
      } catch (err) {
        logger.error('[products] Reorder prices error:', err);
        return reply.status(500).send({ error: 'Failed to reorder prices' });
      }
    },
  );

  // DELETE /api/v1/products/:id/prices/:priceId — soft delete via active=false
  app.delete(
    '/api/v1/products/:id/prices/:priceId',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id, priceId } = request.params as { id: string; priceId: string };

        const product = await prisma.product.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!product) return reply.status(404).send({ error: 'Product not found' });

        const existing = await prisma.productPrice.findFirst({
          where: { id: priceId, productId: id, active: true },
          select: { id: true, isDefault: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Price tier not found' });

        if (existing.isDefault) {
          return reply.status(400).send({
            error: 'Không thể xoá mức giá đang là mặc định. Hãy chuyển mặc định sang mức khác trước.',
          });
        }

        await prisma.productPrice.update({
          where: { id: priceId },
          data: { active: false },
        });
        return { success: true };
      } catch (err) {
        logger.error('[products] Delete price error:', err);
        return reply.status(500).send({ error: 'Failed to delete price tier' });
      }
    },
  );
}
