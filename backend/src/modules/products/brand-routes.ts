/**
 * Brand & Supplier CRUD.
 *
 *  - List: any authenticated user (used by product form's brand dropdown)
 *  - Create / update / delete: owner | admin only (Brand & NCC settings page)
 *  - Soft delete: blocked when there are products (brand) or brands
 *    (supplier) still attached. Returns 400 with a Vietnamese reason.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function brandRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Brands ─────────────────────────────────────────────────────────────
  app.get('/api/v1/brands', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { activeOnly = '0' } = request.query as Record<string, string>;
      const where: any = { orgId: user.orgId };
      if (activeOnly === '1') where.active = true;

      const brands = await prisma.brand.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, country: true } },
          _count: { select: { products: true } },
        },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      });

      // Attach count of ACTIVE products per brand so the UI can show only
      // brands that still have a sellable product by default (and reveal
      // the rest on search).
      const activeCounts = await prisma.product.groupBy({
        by: ['brandId'],
        where: { orgId: user.orgId, status: 'active', brandId: { not: null } },
        _count: { _all: true },
      });
      const activeMap = new Map<string, number>(
        activeCounts.map((r: any) => [r.brandId, r._count._all]),
      );
      const brandsWithActive = brands.map((b: any) => ({
        ...b,
        activeProductCount: activeMap.get(b.id) ?? 0,
      }));
      return { brands: brandsWithActive };
    } catch (err) {
      logger.error('[brands] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch brands' });
    }
  });

  app.post(
    '/api/v1/brands',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = request.body as Record<string, any>;

        if (!body.name?.trim()) {
          return reply.status(400).send({ error: 'Tên brand là bắt buộc' });
        }

        const created = await prisma.brand.create({
          data: {
            orgId: user.orgId,
            name: body.name.trim(),
            supplierId: body.supplierId ?? null,
            description: body.description ?? null,
            logoUrl: body.logoUrl ?? null,
            active: body.active ?? true,
          },
          include: {
            supplier: { select: { id: true, name: true, country: true } },
            _count: { select: { products: true } },
          },
        });
        return reply.status(201).send(created);
      } catch (err) {
        logger.error('[brands] Create error:', err);
        return reply.status(500).send({ error: 'Failed to create brand' });
      }
    },
  );

  app.put(
    '/api/v1/brands/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as Record<string, any>;

        const existing = await prisma.brand.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Brand not found' });

        const data: any = {};
        const fields = ['name', 'supplierId', 'description', 'logoUrl', 'active'];
        for (const f of fields) {
          if (body[f] !== undefined) data[f] = body[f];
        }
        if (data.name !== undefined) {
          if (!data.name.trim()) {
            return reply.status(400).send({ error: 'Tên brand không được rỗng' });
          }
          data.name = data.name.trim();
        }

        const updated = await prisma.brand.update({
          where: { id },
          data,
          include: {
            supplier: { select: { id: true, name: true, country: true } },
            _count: { select: { products: true } },
          },
        });
        return updated;
      } catch (err) {
        logger.error('[brands] Update error:', err);
        return reply.status(500).send({ error: 'Failed to update brand' });
      }
    },
  );

  app.delete(
    '/api/v1/brands/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };

        const existing = await prisma.brand.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, _count: { select: { products: true } } },
        });
        if (!existing) return reply.status(404).send({ error: 'Brand not found' });

        if (existing._count.products > 0) {
          return reply.status(400).send({
            error: `Không thể xoá brand đang được dùng bởi ${existing._count.products} sản phẩm. Hãy đổi sang trạng thái Ngừng hoặc xoá sản phẩm trước.`,
          });
        }

        await prisma.brand.update({
          where: { id },
          data: { active: false },
        });
        return { success: true };
      } catch (err) {
        logger.error('[brands] Delete error:', err);
        return reply.status(500).send({ error: 'Failed to delete brand' });
      }
    },
  );

  // ── Suppliers ──────────────────────────────────────────────────────────
  // Các field text công nợ/liên hệ (nullable) — trim, rỗng → null.
  const SUPPLIER_TEXT_FIELDS = [
    'country',
    'contactInfo',
    'bankName',
    'bankAccount',
    'bankHolder',
    'taxCode',
    'email',
    'phone',
    'address',
    'notes',
    'companyName',
    'representative',
    'representativeTitle',
  ] as const;

  // Dựng `data` Prisma từ body cho create/update. Khi update chỉ set field có gửi lên.
  function buildSupplierData(body: Record<string, any>, partial: boolean): Record<string, any> {
    const data: Record<string, any> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.active !== undefined) data.active = !!body.active;
    for (const f of SUPPLIER_TEXT_FIELDS) {
      if (body[f] !== undefined) {
        const v = body[f] == null ? '' : String(body[f]).trim();
        data[f] = v === '' ? null : v;
      }
    }
    // paymentTermDays: ép số nguyên >= 0; create không gửi → để Prisma dùng default 30.
    if (body.paymentTermDays !== undefined && body.paymentTermDays !== null && body.paymentTermDays !== '') {
      const n = Math.trunc(Number(body.paymentTermDays));
      if (!Number.isFinite(n) || n < 0) {
        throw new Error('Hạn thanh toán phải là số ngày >= 0');
      }
      data.paymentTermDays = n;
    } else if (!partial && body.paymentTermDays === '') {
      // create với chuỗi rỗng → bỏ qua, dùng default.
    }
    return data;
  }

  app.get('/api/v1/suppliers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const suppliers = await prisma.supplier.findMany({
        where: { orgId: user.orgId },
        include: { _count: { select: { brands: true } } },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      });
      return { suppliers };
    } catch (err) {
      logger.error('[suppliers] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch suppliers' });
    }
  });

  app.post(
    '/api/v1/suppliers',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = request.body as Record<string, any>;

        if (!body.name?.trim()) {
          return reply.status(400).send({ error: 'Tên NCC là bắt buộc' });
        }

        let data: Record<string, any>;
        try {
          data = buildSupplierData(body, false);
        } catch (e: any) {
          return reply.status(400).send({ error: e?.message ?? 'Dữ liệu không hợp lệ' });
        }

        const created = await prisma.supplier.create({
          data: {
            orgId: user.orgId,
            active: true,
            ...data,
          },
          include: { _count: { select: { brands: true } } },
        });
        return reply.status(201).send(created);
      } catch (err) {
        logger.error('[suppliers] Create error:', err);
        return reply.status(500).send({ error: 'Failed to create supplier' });
      }
    },
  );

  app.put(
    '/api/v1/suppliers/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as Record<string, any>;

        const existing = await prisma.supplier.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Supplier not found' });

        if (body.name !== undefined && !String(body.name).trim()) {
          return reply.status(400).send({ error: 'Tên NCC không được rỗng' });
        }

        let data: Record<string, any>;
        try {
          data = buildSupplierData(body, true);
        } catch (e: any) {
          return reply.status(400).send({ error: e?.message ?? 'Dữ liệu không hợp lệ' });
        }

        const updated = await prisma.supplier.update({
          where: { id },
          data,
          include: { _count: { select: { brands: true } } },
        });
        return updated;
      } catch (err) {
        logger.error('[suppliers] Update error:', err);
        return reply.status(500).send({ error: 'Failed to update supplier' });
      }
    },
  );

  app.delete(
    '/api/v1/suppliers/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };

        const existing = await prisma.supplier.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, _count: { select: { brands: true } } },
        });
        if (!existing) return reply.status(404).send({ error: 'Supplier not found' });

        if (existing._count.brands > 0) {
          return reply.status(400).send({
            error: `Không thể xoá NCC đang gắn với ${existing._count.brands} brand. Hãy gỡ brand khỏi NCC này trước.`,
          });
        }

        await prisma.supplier.update({
          where: { id },
          data: { active: false },
        });
        return { success: true };
      } catch (err) {
        logger.error('[suppliers] Delete error:', err);
        return reply.status(500).send({ error: 'Failed to delete supplier' });
      }
    },
  );
}
