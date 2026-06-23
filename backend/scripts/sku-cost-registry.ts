/**
 * SKU Cost Registry — nguồn DUY NHẤT cho giá vốn khi import đơn bán hàng.
 *
 * Quy tắc do anh Philip chốt (13/05/2026):
 *   1. KHÔNG tin cột "Giá vốn" trong Excel MISA Sổ chi tiết bán hàng.
 *   2. Mọi đơn import phải lấy unit cost từ registry này.
 *   3. Khi script import phát hiện cost Excel lệch >5% so registry → DỪNG,
 *      cảnh báo, hỏi anh trước khi tiếp tục.
 *   4. Khi gặp SKU chưa có trong registry → DỪNG, yêu cầu anh chốt giá trước.
 *   5. Cost trong registry CHỈ thay đổi khi anh ra yêu cầu rõ ràng (đổi NCC,
 *      đàm phán lại, v.v.). Khi đổi → update file này + commit Git để có
 *      lịch sử thay đổi.
 *
 * Cách dùng trong script import-YYYY-MM-DD.ts:
 *   import { getSkuCost, isDiscontinued } from './sku-cost-registry';
 *   const unitCost = getSkuCost(sku);  // throw nếu SKU không có trong registry
 *   const lineCost = unitCost * quantity;
 */

export interface SkuCostEntry {
  unitCost: number;          // đồng VND / 1 đơn vị (Hộp/Lọ/Bộ)
  effectiveFrom?: string;    // YYYY-MM-DD — ngày bắt đầu áp dụng cost này
  note?: string;             // ghi chú vì sao đổi cost
}

/**
 * Map SKU → unit cost chuẩn.
 *
 * Cost dưới đây được anh Philip chốt sau khi review toàn bộ 53 SKU đã phát
 * sinh đơn trong DB (snapshot 12-13/05/2026). Các SKU "OK" (cost ổn định
 * từ trước) được giữ nguyên giá trị phổ biến nhất trong lịch sử.
 */
export const SKU_COST_REGISTRY: Record<string, SkuCostEntry> = {
  // ── Manhae (Pháp) ────────────────────────────────────────────────────
  MH_01:        { unitCost: 240_000, note: 'Manhae Menopause 30v' },
  MH_02:        { unitCost: 436_000, note: 'Manhae Menopause 60v' },
  MH_03:        { unitCost: 655_000, effectiveFrom: '2026-05-08', note: 'Manhae Menopause 90v — NCC tăng giá, áp dụng cho đơn mới chưa có cost. KHÔNG backfill đơn cũ.' },
  MH_04:        { unitCost: 195_000, effectiveFrom: '2026-05-01', note: 'Vitamin tổng hợp bầu Manhae Femmes — sync DB Bảng giá vốn 19/05' },
  MH_05:        { unitCost: 381_000, effectiveFrom: '2026-05-01', note: 'Vitavea Force G Libido 60v — sync DB Bảng giá vốn 19/05' },
  MH_07:        { unitCost: 285_000, effectiveFrom: '2026-05-01', note: 'Manhae Intima Equilibre 30v — sync DB Bảng giá vốn 19/05' },
  MH_09:        { unitCost: 330_000, note: 'Manhae Collagen Expert 30v' },
  MH_003:       { unitCost: 763_200, effectiveFrom: '2026-06-23', note: 'Manhae Nutrisante 120v (nội tiết) — anh Philip chốt 23/06. Cuối quý có thưởng thêm 1% từ NCC (chưa tính vào cost).' },
  'MNH-MEN-60': { unitCost: 620_000, note: 'Manhae Ménopause 60v (mã mới)' },

  // ── Bioisland ────────────────────────────────────────────────────────
  BIO_01:       { unitCost: 511_000, effectiveFrom: '2026-05-01', note: 'Bioisland DHA For Kids 60v — sync DB Bảng giá vốn 19/05' },
  BIO_02:       { unitCost: 462_000, effectiveFrom: '2026-05-01', note: 'Bioisland Zinc 120v — sync DB Bảng giá vốn 19/05' },
  BIO_05:       { unitCost: 577_500, effectiveFrom: '2026-05-01', note: 'Bioisland Lysine 60v — sync DB Bảng giá vốn 19/05' },
  BIO_06:       { unitCost: 630_000, effectiveFrom: '2026-05-01', note: 'Bioisland DHA bầu 60v — sync DB Bảng giá vốn 19/05' },
  BIO_07:       { unitCost: 588_000, effectiveFrom: '2026-05-01', note: 'Bioisland Milk Canxi Bon Care 150v — sync DB Bảng giá vốn 19/05' },
  'BIO-VTD-90': { unitCost: 180_000, note: 'Bioisland Vitamin D 90v' },

  // ── Optibac ──────────────────────────────────────────────────────────
  OTB01:        { unitCost: 340_000, note: 'Optibac For Women 30v' },
  OTB02:        { unitCost: 748_000, note: 'Optibac For Women 90v — anh Philip chốt 13/05 (margin thực ~3%)' },
  OTB03:        { unitCost: 374_000, note: 'Optibac Pregnancy 30v' },
  OTB08:        { unitCost: 295_394, note: 'Optibac Baby Drops' },

  // ── Neubria / Neubiotics ─────────────────────────────────────────────
  NEU_01:       { unitCost: 265_000, effectiveFrom: '2026-05-01', note: 'Neubiotics Her (men phụ khoa) — sync DB Bảng giá vốn 19/05. Cuối tháng có thưởng thêm 5% từ NCC.' },
  NEU_04:       { unitCost: 280_000, effectiveFrom: '2026-06-23', note: 'Neubria Neu Kid 30v — anh Philip chốt 23/06. Cuối tháng có thưởng thêm 5% từ NCC.' },
  'NEU-EDG-30': { unitCost: 380_000, note: 'Neubria Edge 30v' },

  // ── Healthy Care (Úc) ────────────────────────────────────────────────
  HC_01:        { unitCost: 161_557, note: 'Healthy Care Super Lecithin 100tab' },
  HC_03:        { unitCost: 350_000, note: 'Healthy Care Fish Oil 1000mg Omega' },
  HC_11:        { unitCost: 365_000, effectiveFrom: '2026-06-23', note: 'Healthy Care Ultimate Omega 3-6-9 200tab — anh Philip chốt 23/06.' },

  // ── Swisse (Úc) ──────────────────────────────────────────────────────
  SW_1:         { unitCost: 153_548, note: 'Swisse Liver Detox 60v' },
  SW_05:        { unitCost: 236_214, note: 'Swisse Liver Detox 120v' },
  SW_11:        { unitCost: 250_000, note: 'Swisse Hair Skin Nails' },
  SW_011:       { unitCost: 160_000, note: 'Swisse Hair Skin Nails (mã khác)' },
  SW_16:        { unitCost: 157_308, note: "Swisse Men's Multivitamin" },
  SW_17:        { unitCost: 255_000, note: "Swisse Women's Multivitamin" },

  // ── Arkopharma (Pháp) ────────────────────────────────────────────────
  ARK_01:       { unitCost: 252_000, note: 'Forcapil mọc tóc' },
  ARK_02:       { unitCost: 355_000, note: 'Arkogelules Omega 3' },
  ARK_03:       { unitCost: 223_000, note: 'Forcapil dưỡng tóc' },
  ARK_04:       { unitCost: 299_000, note: 'Arkopharma Detoxifiant' },
  ARK_05:       { unitCost: 665_000, note: 'Perles De Peau Collagen 10 ống' },

  // ── Nature Made / khác ───────────────────────────────────────────────
  NM_1:         { unitCost: 620_503, note: 'Nature Made Prenatal' },
  DDR_01:       { unitCost: 332_403, note: 'Vitamin D3 Ddrops 400IU' },
  GH_01:        { unitCost: 173_810, note: 'Oyster Plus Goodhealth' },
  GH_001:       { unitCost: 449_385, note: 'GH Creation EX+ 270v' },
  'INO-COL-60': { unitCost: 280_000, note: 'Inocare Collagen 60v' },
  VTPB_02:      { unitCost: 368_133, note: 'Vitamin tổng hợp phụ nữ sau sinh' },
  VTR_16:       { unitCost: 35_758,  note: 'Vitatree Glucosamine' },
  PBB_01:       { unitCost: 94_250,  note: "P'tit BOBO Isotonic xịt mũi" },
  PBB_001:      { unitCost: 81_250,  note: "P'tit BOBO Isotonic (mã khác)" },
  PRT_32:       { unitCost: 180_000, note: 'Biotin 10000mcg 100v' },
  VAG_001:      { unitCost: 148_000, effectiveFrom: '2026-05-01', note: 'Vagisil 240ml (Hồng) — added 19/05 từ Bảng giá vốn' },

  // ── Inocare / Inc (Tăm nước + Bàn chải điện) ─────────────────────────
  INC_01H:      { unitCost: 236_414, effectiveFrom: '2026-05-13', note: 'Ultra Flosser X3A màu hồng — anh Philip chốt 13/05 (loại 114k là sai)' },
  INC_01TRANG:  { unitCost: 236_414, note: 'Ultra Flosser X3A màu trắng' },
  INC_01XL:     { unitCost: 236_414, note: 'Ultra Flosser X3A xanh lá' },
  INC_01XD:     { unitCost: 236_414, note: 'Ultra Flosser X3A xanh dương' },
  INC_02T:      { unitCost: 246_017, note: 'Pro Water Flosser X6 màu trắng' },
  INC_02D:      { unitCost: 246_017, note: 'Pro Water Flosser X6 màu đen' },
  INC_03T:      { unitCost: 197_200, note: 'Super Smart Electric Brush trắng' },
  INC_03H:      { unitCost: 197_200, note: 'Super Smart Electric Brush hồng' },
  INC_03D:      { unitCost: 197_200, note: 'Super Smart Electric Brush đen' },
};

/**
 * SKU đã ngừng kinh doanh — KHÔNG có trong registry, không nên có đơn mới.
 * Nếu script import gặp SKU này → cảnh báo + hỏi anh có muốn re-activate
 * (cung cấp cost mới) hay reject đơn.
 */
export const DISCONTINUED_SKUS = new Set<string>([
  'NEU_07',  // Neubria Omega Krill — anh Philip yêu cầu bỏ 13/05/2026
  'SUA_3',   // Sữa Aptamil Profutura — anh Philip yêu cầu bỏ 13/05/2026
]);

/**
 * Trả về unit cost chuẩn của 1 SKU. Throw nếu không có (kể cả discontinued).
 * Script import dùng hàm này để buộc anh Philip phải confirm cost trước khi
 * đưa SKU mới vào hệ thống.
 */
export function getSkuCost(sku: string): number {
  if (DISCONTINUED_SKUS.has(sku)) {
    throw new Error(
      `SKU ${sku} đã ngừng kinh doanh. Nếu đơn mới phát sinh, hỏi anh Philip ` +
      `có muốn re-activate (cung cấp unit cost mới) hay reject đơn.`
    );
  }
  const entry = SKU_COST_REGISTRY[sku];
  if (!entry) {
    throw new Error(
      `SKU ${sku} chưa có trong cost registry. ` +
      `Yêu cầu anh Philip chốt unit cost rồi thêm vào ` +
      `backend/scripts/sku-cost-registry.ts trước khi import.`
    );
  }
  return entry.unitCost;
}

export function isDiscontinued(sku: string): boolean {
  return DISCONTINUED_SKUS.has(sku);
}

/**
 * Tỷ lệ lệch cho phép giữa cost Excel MISA và cost registry. Nếu lệch vượt
 * ngưỡng này, script import phải DỪNG và yêu cầu anh Philip xác nhận.
 */
export const COST_VARIANCE_THRESHOLD_PCT = 5;

/**
 * Trả về { ok, diffPct } khi so sánh cost Excel với registry. Dùng trong
 * dry-run của script import để in cảnh báo.
 */
export function checkCostVariance(
  sku: string,
  excelUnitCost: number
): { ok: boolean; registryCost: number; diffPct: number } {
  const registryCost = getSkuCost(sku);
  if (registryCost === 0) return { ok: true, registryCost, diffPct: 0 };
  const diffPct = Math.abs((excelUnitCost - registryCost) / registryCost) * 100;
  return { ok: diffPct <= COST_VARIANCE_THRESHOLD_PCT, registryCost, diffPct };
}
