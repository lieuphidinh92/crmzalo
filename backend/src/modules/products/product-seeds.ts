/**
 * Idempotent seed for the Sản phẩm module.
 *   - 5 suppliers (Pháp / Úc / Anh / Ấn Độ / Úc)
 *   - 5 brands (Manhae, Bioisland, Neubria, Inocare, Vitatree)
 *   - 8 sample products with default cost + 4 price tiers each + 1-2 mock
 *     marketing docs each
 *
 * Called from a preHandler hook on the products list endpoint
 * (`seed-on-first-use` pattern, like task-seeds.ts / learning-seeds.ts).
 * Safe to run multiple times — every step uses upsert/find-or-create.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

interface SeedSupplier {
  name: string;
  country: string;
  contactInfo?: string;
}

interface SeedBrand {
  name: string;
  supplier: string;
  description: string;
}

interface SeedTier {
  tierName: string;
  price: number;
  displayOrder: number;
  isDefault?: boolean;
}

interface SeedProduct {
  sku: string;
  name: string;
  brand: string;
  packageSize: string;
  status: 'active' | 'discontinued' | 'coming_soon';
  mainUse: string;
  targetAudience: string;
  usageMethod: string;
  shelfLifeMonths: number;
  registrationNumber: string;
  totalStock: number;
  costPrice: number;
  prices: SeedTier[];
  marketingDocs: Array<{ type: string; name: string; driveUrl: string }>;
}

const SUPPLIERS: SeedSupplier[] = [
  { name: 'Laboratoires Manhae (Pháp)', country: 'Pháp', contactInfo: 'NCC chính cho dòng Manhae — Manhae Ménopause, Cycle, PMS, Peau, Silhouette' },
  { name: 'Bioisland Australia', country: 'Úc', contactInfo: 'NCC dòng Bioisland — Calcium, Vitamin D, DHA' },
  { name: 'Neubria UK', country: 'Anh', contactInfo: 'NCC dòng Neubria — Edge, Calm, Krill' },
  { name: 'Inocare India', country: 'Ấn Độ', contactInfo: 'NCC dòng Inocare — Collagen, Beauty supplements' },
  { name: 'Vitatree Australia', country: 'Úc', contactInfo: 'NCC dòng Vitatree — Multivitamin, Liver Detox' },
];

const BRANDS: SeedBrand[] = [
  { name: 'Manhae', supplier: 'Laboratoires Manhae (Pháp)', description: 'Thương hiệu dược mỹ phẩm Pháp chuyên về sức khoẻ phụ nữ tuổi tiền mãn kinh — mãn kinh' },
  { name: 'Bioisland', supplier: 'Bioisland Australia', description: 'Thương hiệu TPCN cao cấp Úc cho mẹ và bé — bổ sung canxi, DHA, vitamin D' },
  { name: 'Neubria', supplier: 'Neubria UK', description: 'Thương hiệu TPCN Anh tập trung sức khoẻ não bộ và tinh thần' },
  { name: 'Inocare', supplier: 'Inocare India', description: 'Thương hiệu TPCN Ấn Độ về collagen và làm đẹp' },
  { name: 'Vitatree', supplier: 'Vitatree Australia', description: 'Thương hiệu TPCN Úc về multivitamin và detox gan' },
];

const DEFAULT_TIERS = (basePrice: number, retail: number): SeedTier[] => [
  { tierName: 'CTV', price: basePrice, displayOrder: 1, isDefault: true },
  { tierName: 'Đại lý cấp 1', price: Math.round(basePrice * 0.92), displayOrder: 2 },
  { tierName: 'Đại lý cấp 2 (VIP)', price: Math.round(basePrice * 0.85), displayOrder: 3 },
  { tierName: 'Giá lẻ niêm yết', price: retail, displayOrder: 4 },
];

const PRODUCTS: SeedProduct[] = [
  {
    sku: 'MNH-MEN-60',
    name: 'Manhae Ménopause hộp 60v',
    brand: 'Manhae',
    packageSize: '60 viên/hộp',
    status: 'active',
    mainUse: 'Cân bằng nội tiết tố nữ, giảm bốc hoả, mất ngủ, khô âm đạo trong giai đoạn mãn kinh.',
    targetAudience: 'Phụ nữ trên 45 tuổi đang ở giai đoạn tiền mãn kinh — mãn kinh',
    usageMethod: 'Uống 2 viên/ngày sau bữa ăn sáng, dùng liên tục 2-3 tháng.',
    shelfLifeMonths: 36,
    registrationNumber: '5145/2023/ĐKSP',
    totalStock: 142,
    costPrice: 620_000,
    prices: DEFAULT_TIERS(850_000, 1_200_000),
    marketingDocs: [
      { type: 'pdf', name: 'Brochure Manhae Ménopause', driveUrl: 'https://drive.google.com/file/d/sample-MNH-MEN-brochure/view' },
      { type: 'video', name: 'Video giới thiệu Manhae Ménopause', driveUrl: 'https://drive.google.com/file/d/sample-MNH-MEN-video/view' },
    ],
  },
  {
    sku: 'MNH-CYC-60',
    name: 'Manhae Cycle hộp 60v',
    brand: 'Manhae',
    packageSize: '60 viên/hộp',
    status: 'active',
    mainUse: 'Hỗ trợ điều hoà chu kỳ kinh nguyệt, giảm đau bụng kinh, giảm mụn nội tiết.',
    targetAudience: 'Phụ nữ 18-40 tuổi có chu kỳ kinh nguyệt không đều, hay đau bụng kinh',
    usageMethod: 'Uống 2 viên/ngày sau bữa ăn, duy trì 3 chu kỳ liên tục.',
    shelfLifeMonths: 36,
    registrationNumber: '5146/2023/ĐKSP',
    totalStock: 88,
    costPrice: 580_000,
    prices: DEFAULT_TIERS(790_000, 1_100_000),
    marketingDocs: [
      { type: 'pdf', name: 'Brochure Manhae Cycle', driveUrl: 'https://drive.google.com/file/d/sample-MNH-CYC-brochure/view' },
    ],
  },
  {
    sku: 'MNH-PMS-60',
    name: 'Manhae PMS hộp 60v',
    brand: 'Manhae',
    packageSize: '60 viên/hộp',
    status: 'active',
    mainUse: 'Giảm hội chứng tiền kinh nguyệt — căng tức ngực, cáu gắt, đau đầu trước kỳ.',
    targetAudience: 'Phụ nữ 20-45 tuổi gặp PMS rõ rệt mỗi tháng',
    usageMethod: 'Uống 2 viên/ngày, bắt đầu 7 ngày trước kỳ kinh dự kiến.',
    shelfLifeMonths: 36,
    registrationNumber: '5147/2023/ĐKSP',
    totalStock: 25,
    costPrice: 550_000,
    prices: DEFAULT_TIERS(750_000, 1_050_000),
    marketingDocs: [
      { type: 'image', name: 'Hình ảnh sản phẩm PMS', driveUrl: 'https://drive.google.com/file/d/sample-MNH-PMS-img/view' },
    ],
  },
  {
    sku: 'MNH-PEA-30',
    name: 'Manhae Peau hộp 30v',
    brand: 'Manhae',
    packageSize: '30 viên/hộp',
    status: 'active',
    mainUse: 'Làm đẹp da từ bên trong — giảm nám, đồi mồi, tăng độ đàn hồi.',
    targetAudience: 'Phụ nữ 30+ quan tâm đến lão hoá da',
    usageMethod: 'Uống 1 viên/ngày sau bữa ăn, kéo dài 2-3 tháng.',
    shelfLifeMonths: 24,
    registrationNumber: '5148/2023/ĐKSP',
    totalStock: 0,
    costPrice: 480_000,
    prices: DEFAULT_TIERS(680_000, 950_000),
    marketingDocs: [
      { type: 'text', name: 'Bài viết chuyên sâu Manhae Peau', driveUrl: 'https://drive.google.com/file/d/sample-MNH-PEA-article/view' },
      { type: 'image', name: 'Ảnh minh hoạ trước-sau', driveUrl: 'https://drive.google.com/file/d/sample-MNH-PEA-before-after/view' },
    ],
  },
  {
    sku: 'BIO-CAL-90',
    name: 'Bioisland Calcium hộp 90v',
    brand: 'Bioisland',
    packageSize: '90 viên/hộp',
    status: 'active',
    mainUse: 'Bổ sung canxi cho trẻ em — phát triển chiều cao, xương răng chắc khoẻ.',
    targetAudience: 'Trẻ em 6 tháng đến 12 tuổi',
    usageMethod: 'Trẻ 6-24 tháng: 1 viên/ngày. Trẻ trên 2 tuổi: 2 viên/ngày.',
    shelfLifeMonths: 24,
    registrationNumber: '12345/2022/ĐKSP',
    totalStock: 220,
    costPrice: 220_000,
    prices: DEFAULT_TIERS(320_000, 450_000),
    marketingDocs: [
      { type: 'pdf', name: 'HDSD Bioisland Calcium', driveUrl: 'https://drive.google.com/file/d/sample-BIO-CAL-hdsd/view' },
    ],
  },
  {
    sku: 'BIO-VTD-90',
    name: 'Bioisland Vitamin D hộp 90v',
    brand: 'Bioisland',
    packageSize: '90 viên/hộp',
    status: 'active',
    mainUse: 'Bổ sung vitamin D3 — hỗ trợ hấp thu canxi, tăng đề kháng cho trẻ.',
    targetAudience: 'Trẻ em 6 tháng đến 12 tuổi',
    usageMethod: '1 viên/ngày, có thể nhai hoặc nuốt nguyên viên.',
    shelfLifeMonths: 24,
    registrationNumber: '12346/2022/ĐKSP',
    totalStock: 38,
    costPrice: 180_000,
    prices: DEFAULT_TIERS(260_000, 380_000),
    marketingDocs: [
      { type: 'video', name: 'Video review từ KOL', driveUrl: 'https://drive.google.com/file/d/sample-BIO-VTD-kol/view' },
    ],
  },
  {
    sku: 'NEU-EDG-30',
    name: 'Neubria Edge hộp 30v',
    brand: 'Neubria',
    packageSize: '30 viên/hộp',
    status: 'coming_soon',
    mainUse: 'Tăng cường tập trung, trí nhớ — hỗ trợ não bộ cho người làm việc trí óc.',
    targetAudience: 'Người trưởng thành 25-55 tuổi cần tập trung cao độ',
    usageMethod: '1 viên/ngày vào buổi sáng.',
    shelfLifeMonths: 24,
    registrationNumber: '7788/2024/ĐKSP',
    totalStock: 0,
    costPrice: 380_000,
    prices: DEFAULT_TIERS(520_000, 750_000),
    marketingDocs: [
      { type: 'pdf', name: 'Tài liệu khoa học Neubria Edge', driveUrl: 'https://drive.google.com/file/d/sample-NEU-EDG-science/view' },
    ],
  },
  {
    sku: 'INO-COL-60',
    name: 'Inocare Collagen hộp 60v',
    brand: 'Inocare',
    packageSize: '60 viên/hộp',
    status: 'active',
    mainUse: 'Bổ sung collagen peptide — cải thiện độ ẩm, đàn hồi, giảm nếp nhăn.',
    targetAudience: 'Phụ nữ 25+ chăm sóc da và tóc',
    usageMethod: '2 viên/ngày sau bữa ăn, uống nhiều nước.',
    shelfLifeMonths: 24,
    registrationNumber: '9988/2023/ĐKSP',
    totalStock: 64,
    costPrice: 280_000,
    prices: DEFAULT_TIERS(390_000, 590_000),
    marketingDocs: [
      { type: 'image', name: 'Ảnh chi tiết Inocare Collagen', driveUrl: 'https://drive.google.com/file/d/sample-INO-COL-img/view' },
      { type: 'text', name: 'Bài blog so sánh các loại collagen', driveUrl: 'https://drive.google.com/file/d/sample-INO-COL-blog/view' },
    ],
  },
];

let seedingPromise: Promise<void> | null = null;

/**
 * Idempotent — call from preHandler. Returns immediately on subsequent calls
 * (within the same process) if seed already completed, and de-duplicates
 * concurrent calls during initial seed.
 */
export async function ensureProductSeeds(orgId: string): Promise<void> {
  if (seedingPromise) return seedingPromise;
  seedingPromise = runSeed(orgId).catch((err) => {
    seedingPromise = null;
    logger.error('[product-seeds] Seed failed:', err);
    throw err;
  });
  return seedingPromise;
}

async function runSeed(orgId: string): Promise<void> {
  const existing = await prisma.product.count({ where: { orgId } });
  if (existing > 0) {
    return;
  }

  logger.info(`[product-seeds] Seeding products for org ${orgId}...`);

  // Suppliers
  const supplierMap = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const found = await prisma.supplier.findFirst({
      where: { orgId, name: s.name },
      select: { id: true },
    });
    const id =
      found?.id ??
      (
        await prisma.supplier.create({
          data: {
            orgId,
            name: s.name,
            country: s.country,
            contactInfo: s.contactInfo ?? null,
          },
          select: { id: true },
        })
      ).id;
    supplierMap.set(s.name, id);
  }

  // Brands
  const brandMap = new Map<string, string>();
  for (const b of BRANDS) {
    const found = await prisma.brand.findFirst({
      where: { orgId, name: b.name },
      select: { id: true },
    });
    const id =
      found?.id ??
      (
        await prisma.brand.create({
          data: {
            orgId,
            name: b.name,
            supplierId: supplierMap.get(b.supplier) ?? null,
            description: b.description,
          },
          select: { id: true },
        })
      ).id;
    brandMap.set(b.name, id);
  }

  // Products + prices
  for (const p of PRODUCTS) {
    const existingProduct = await prisma.product.findFirst({
      where: { orgId, sku: p.sku },
      select: { id: true },
    });
    if (existingProduct) continue;

    const created = await prisma.product.create({
      data: {
        orgId,
        sku: p.sku,
        name: p.name,
        brandId: brandMap.get(p.brand) ?? null,
        packageSize: p.packageSize,
        status: p.status,
        mainUse: p.mainUse,
        targetAudience: p.targetAudience,
        usageMethod: p.usageMethod,
        shelfLifeMonths: p.shelfLifeMonths,
        registrationNumber: p.registrationNumber,
        totalStock: p.totalStock,
        costPrice: p.costPrice,
        marketingDocs: p.marketingDocs.map((doc, idx) => ({
          id: `${p.sku}-doc-${idx}`,
          type: doc.type,
          name: doc.name,
          driveUrl: doc.driveUrl,
          createdAt: new Date().toISOString(),
        })),
      },
      select: { id: true },
    });

    await prisma.productPrice.createMany({
      data: p.prices.map((tier) => ({
        productId: created.id,
        tierName: tier.tierName,
        price: tier.price,
        displayOrder: tier.displayOrder,
        isDefault: tier.isDefault === true,
      })),
    });
  }

  logger.info(`[product-seeds] Done seeding ${PRODUCTS.length} products`);
}

/**
 * Default 4 tiers attached when admin creates a new product through the UI.
 * Returned as plain objects so the caller can `createMany` them.
 */
export function buildDefaultTiers(): Array<{
  tierName: string;
  price: number;
  displayOrder: number;
  isDefault: boolean;
}> {
  return [
    { tierName: 'CTV', price: 0, displayOrder: 1, isDefault: true },
    { tierName: 'Đại lý cấp 1', price: 0, displayOrder: 2, isDefault: false },
    { tierName: 'Đại lý cấp 2 (VIP)', price: 0, displayOrder: 3, isDefault: false },
    { tierName: 'Giá lẻ niêm yết', price: 0, displayOrder: 4, isDefault: false },
  ];
}
