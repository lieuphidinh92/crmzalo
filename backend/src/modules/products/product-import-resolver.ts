/**
 * Resolve product SKUs referenced by an order/sales import, creating catalog
 * stubs for codes that don't exist yet — but only after explicit confirmation.
 *
 * Flow (matches the "giữ script, thêm bước xác nhận mã mới" decision):
 *   1. Bước 1 (mặc định, confirm=false): liệt kê mã mới + CẢNH BÁO TRÙNG TÊN,
 *      KHÔNG tạo gì. Caller dừng (process.exit) khi result.missing.length > 0.
 *   2. Bước 2 (confirm=true, vd CONFIRM_NEW_SKUS=1): tạo SP nháp cho mã mới
 *      — chỉ SKU + tên, KHÔNG set giá vốn (FIFO/cost-registry lo sau), 4 tier
 *      giá mặc định, hasSales=false (ẩn tới khi phát sinh đơn).
 *
 * Trùng tên là rủi ro nghiêm trọng (chia đôi doanh số — xem memory của anh
 * Philip), nên luôn cảnh báo khi tên SP mới trùng (không dấu) với SP đã có.
 *
 * Pass the script's own Prisma client as `client` so it shares the script's
 * connection/transaction context.
 *
 * ⚠️ SAU KHI tạo đơn (APPLY): script import PHẢI bật Product.hasSales=true cho
 * các SP vừa bán (updateMany hasSales:false→true), nếu không SP có doanh số sẽ
 * bị ẩn oan khỏi sale-app cho tới khi chạy scripts/backfill-has-sales.ts. Xem
 * mẫu ở scripts/import-2026-06-23-halovn.ts (khối `if (APPLY)`). Resolver cố ý
 * KHÔNG tự bật cờ — nó chạy cả trong DRY-RUN, bật ở đây sẽ đánh dấu nhầm.
 */
import { buildDefaultTiers } from './product-seeds.js';

export interface ImportProductRow {
  sku: string;
  name: string;
}

export interface ResolveOptions {
  /** false (default) → report only & stop; true → create stubs for new SKUs. */
  confirm?: boolean;
  /** Attribute created_by/updated_by on stub products. */
  createdById?: string | null;
  /** Default unit for stub products. */
  unit?: string;
}

export interface ResolveResult {
  /** sku → productId for every resolvable SKU (existing + newly created). */
  productBySku: Map<string, string>;
  created: Array<{ sku: string; name: string; id: string }>;
  /** New SKUs (populated whether or not they were created). */
  missing: Array<{ sku: string; name: string; nameClash: string | null }>;
}

// Accent-insensitive, whitespace-normalised name key for clash detection.
function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function resolveOrCreateProducts(
  client: any,
  orgId: string,
  rows: ImportProductRow[],
  opts: ResolveOptions = {},
): Promise<ResolveResult> {
  // Dedupe by SKU (first non-empty name wins).
  const nameBySku = new Map<string, string>();
  for (const r of rows) {
    const sku = (r.sku ?? '').trim();
    if (!sku) continue;
    if (!nameBySku.has(sku) || !nameBySku.get(sku)) {
      nameBySku.set(sku, (r.name ?? '').trim());
    }
  }
  const skus = [...nameBySku.keys()];

  const existing = await client.product.findMany({
    where: { orgId, sku: { in: skus } },
    select: { id: true, sku: true },
  });
  const productBySku = new Map<string, string>(
    existing.map((p: any) => [p.sku, p.id]),
  );

  const result: ResolveResult = { productBySku, created: [], missing: [] };
  const missingSkus = skus.filter((s) => !productBySku.has(s));
  if (missingSkus.length === 0) {
    console.log(`[products] Tất cả ${skus.length} mã SKU đã có trong danh mục.`);
    return result;
  }

  // Name-clash detection against the whole org catalog.
  const allProducts = await client.product.findMany({
    where: { orgId },
    select: { sku: true, name: true },
  });
  const normToExisting = new Map<string, string>();
  for (const p of allProducts) {
    normToExisting.set(normName(p.name), `${p.sku} — ${p.name}`);
  }

  result.missing = missingSkus.map((sku) => {
    const name = nameBySku.get(sku) ?? '';
    return { sku, name, nameClash: normToExisting.get(normName(name)) ?? null };
  });

  console.log(
    `\n──────── ${result.missing.length} MÃ SP MỚI (chưa có trong danh mục) ────────`,
  );
  for (const m of result.missing) {
    console.log(`  • [${m.sku}] ${m.name || '(chưa có tên)'}`);
    if (m.nameClash) {
      console.log(
        `      ⚠️  TRÙNG TÊN với SP đã có: ${m.nameClash} → kiểm tra kẻo CHIA ĐÔI doanh số!`,
      );
    }
  }

  if (!opts.confirm) {
    console.log(
      `\n⛔ DỪNG: chưa tạo SP nào. Soát lại danh sách trên; nếu đúng là SP mới, ` +
        `chạy lại với CONFIRM_NEW_SKUS=1 để tạo.\n`,
    );
    return result;
  }

  console.log(`\n✅ CONFIRM_NEW_SKUS=1 → tạo ${result.missing.length} SP nháp (chưa có giá vốn)...`);
  const unit = opts.unit ?? 'hộp';
  for (const m of result.missing) {
    const created = await client.product.create({
      data: {
        orgId,
        sku: m.sku,
        name: m.name || m.sku,
        status: 'active',
        unit,
        warningStock: 30,
        costPrice: null,
        galleryUrls: [],
        marketingDocs: [],
        createdById: opts.createdById ?? null,
        updatedById: opts.createdById ?? null,
      },
    });
    await client.productPrice.createMany({
      data: buildDefaultTiers().map((t) => ({
        productId: created.id,
        tierName: t.tierName,
        price: t.price,
        displayOrder: t.displayOrder,
        isDefault: t.isDefault,
      })),
    });
    productBySku.set(m.sku, created.id);
    result.created.push({ sku: m.sku, name: m.name, id: created.id });
    console.log(`   [CREATED] ${m.sku} — ${m.name || m.sku}`);
  }
  console.log('');
  return result;
}
