/**
 * One-off import — 19 đơn từ 21/05 đến 24/05/2026.
 *
 * Source files (Downloads/):
 *   - Ban_hang 21-24.5.xlsx                (header — 19 đơn + 1 đơn thiếu)
 *   - So_chi_tiet_ban_hang  21-24.5.xlsx   (22 line items / 19 đơn)
 *
 * Phân bổ:
 *   - 21/05: 10 đơn (XK5919-XK5928) — 7 đã TT, 3 chưa
 *   - 22/05:  8 đơn (XK5929, XK5931-XK5937) — 2 đã TT, 6 chưa
 *   - 23/05:  1 đơn (XK5938) — chưa TT
 *   - 24/05:  0 đơn
 *
 * SKIP (gap đánh số / thiếu data):
 *   - XK5930: không tồn tại (gap MISA — chắc đơn nháp bị hủy)
 *   - XK5939: không tồn tại (gap MISA)
 *   - XK5940: header có (37.750.000đ, KH00060 Chị Hoàng Hoa - HKD Trần
 *     Duy Hải, NVBH Lê Huỳnh Đức, ngày 23/05) NHƯNG sổ chi tiết KHÔNG
 *     có line items. Pattern quen (XK5905 19/05, XK5838, XK5864, XK5869
 *     trước đây). Anh Philip check MISA → nếu có line item thật, viết
 *     script bổ sung `import-2026-05-23b-XK5940.ts`.
 *
 * Quy tắc đã chốt với anh Philip:
 *
 *   1. Giá vốn (13/05): KHÔNG dùng cột "Giá vốn" Excel MISA. Dùng
 *      products.cost_price từ DB (đã sync registry 19/05).
 *
 *   2. Doanh thu để tính lãi gộp (21/05): dùng số CÓ VAT (Tổng tiền
 *      thanh toán), vì cost registry đã bao gồm VAT đầu vào.
 *
 * Đặc thù XK5925 (Phạm Trang Nhung, KH lẻ, đơn có VAT 8%):
 *   Excel MISA: unitPrice CHƯA VAT 263.888,89đ × 1.08 = 285.000đ CÓ VAT
 *   → script dùng unitPrice 285k (tròn), header = 1.425.000đ.
 *
 * Quà tặng:
 *   XK5919 (Pharceco): VAG_001 ×1 kèm — lineTotal=0, isGift=true.
 *
 * Bug đã biết (MISA cost lệch — sẽ cảnh báo kế toán):
 *   - MH_03: MISA cost=0 cho TẤT CẢ lô mới (NCC tăng giá 08/05). 115 hộp
 *     MH_03 hôm nay ghi cost=0; CRM xài 655k (registry).
 *   - BIO_07 XK5922: MISA cost ~369k vs registry 588k (lệch -37%).
 *   - BIO_07 XK5938: MISA cost 532k vs registry 588k (lệch -9.5%).
 *   - MH_01 nhiều đơn: MISA cost ~224k vs registry 240k (lệch -6.6%).
 *
 * Status: tất cả đơn = Đã xuất đủ → status='completed'.
 * Idempotent: skip nếu orderCode đã tồn tại.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-2026-05-21-24.ts          # dry-run
 *   npx tsx --env-file=.env scripts/import-2026-05-21-24.ts --apply  # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

interface OrderHeader {
  orderCode: string;
  orderDate: string;          // YYYY-MM-DD
  misaCode: string;
  customerName: string;
  saleName: string;
  paymentPaid: boolean;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  address: string;
  province: string;
  ward: string;
  phone: string;
  description: string;
  total: number;              // = "Tổng tiền thanh toán" (có VAT nếu có)
  hasVat: boolean;
}

interface LineItem {
  orderCode: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;          // CÓ VAT (nếu đơn có VAT) — khớp với lineTotal
  lineTotal: number;
  isGift?: boolean;
}

// ── 21/05 (10 đơn) ─────────────────────────────────────────────────
const ORDERS: OrderHeader[] = [
  {
    orderCode: 'XK5919',
    orderDate: '2026-05-21',
    misaCode: 'KH20083',
    customerName: 'CÔNG TY CỔ PHẦN LIÊN KẾT NHÀ THUỐC PHARCECO',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'Thôn Bá Khê, Xã Văn Giang, Tỉnh Hưng Yên',
    province: 'Hưng Yên',
    ward: 'Xã Văn Giang',
    phone: '0963500770',
    description: 'Bán hàng CTCP Pharceco (tặng kèm VAG_001 ×1)',
    total: 9_645_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5920',
    orderDate: '2026-05-21',
    misaCode: 'KH20084',
    customerName: 'Phước Nguyên - HỘ KINH DOANH NHÀ THUỐC PHƯỚC NGUYÊN',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Tổ 12 ấp Thị Tứ, xã Mỹ Thuận, tỉnh An Giang',
    province: 'An Giang',
    ward: 'Xã Mỹ Thuận',
    phone: '0949378388',
    description: 'Bán hàng Phước Nguyên - HKD Nhà thuốc Phước Nguyên',
    total: 1_425_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5921',
    orderDate: '2026-05-21',
    misaCode: 'KH20085',
    customerName: 'Chị Thanh - CÔNG TY TNHH KING KANG',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Số 659A Đường Lạc Long Quân, Tây Hồ, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Tây Hồ',
    phone: '0981896333',
    description: 'Bán hàng Chị Thanh - CTY TNHH King Kang',
    total: 1_895_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5922',
    orderDate: '2026-05-21',
    misaCode: 'KH20086',
    customerName: 'Chị Hạnh - HKD TRẦN QUANG THUẬN TQT',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: '156A Nguyễn Hữu Thọ, Phước Kiển, Nhà Bè',
    province: 'TP HCM',
    ward: 'Xã Nhà Bè',
    phone: '0352449531',
    description: 'Bán hàng Chị Hạnh - HKD Trần Quang Thuận TQT',
    total: 3_050_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5923',
    orderDate: '2026-05-21',
    misaCode: 'KH00001',
    customerName: 'Di Di (Yến Nhi)',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'CT7B KĐT Văn Quán, phường Phúc La, quận Hà Đông, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0907586210',
    description: 'Bán hàng Di Di (Yến Nhi)',
    total: 2_960_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5924',
    orderDate: '2026-05-21',
    misaCode: 'PML0017',
    customerName: 'PML Nhà Thuốc Minh Hiền',
    saleName: 'Halo VN',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'tổ 10 khu 34, Xã Song Mai, Thành phố Bắc Giang, Bắc Giang',
    province: 'Bắc Giang',
    ward: 'Xã Song Mai',
    phone: '0988306826',
    description: 'Bán hàng PML Nhà Thuốc Minh Hiền',
    total: 2_850_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5925',
    orderDate: '2026-05-21',
    misaCode: 'KH001305',
    customerName: 'Phạm Trang Nhung',
    saleName: 'Halo VN',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: '07 Nguyễn Du, phường Hoa Lư, Ninh Bình',
    province: 'Ninh Bình',
    ward: 'Phường Hoa Lư',
    phone: '',
    description: 'Bán hàng Phạm Trang Nhung (VAT 8%)',
    total: 1_425_000,
    hasVat: true,
  },
  {
    orderCode: 'XK5926',
    orderDate: '2026-05-21',
    misaCode: 'PML0018',
    customerName: 'PML Quầy thuốc Đỗ Cúc',
    saleName: 'Halo VN',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'Số 222 đường thượng lâm trang, Xã Thượng Lâm, Mỹ Đức, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Mỹ Đức',
    phone: '0388555115',
    description: 'Bán hàng PML Quầy thuốc Đỗ Cúc',
    total: 1_425_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5927',
    orderDate: '2026-05-21',
    misaCode: 'PML0019',
    customerName: 'PML Nhà thuôc Thúy Vân',
    saleName: 'Halo VN',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'Số 4 ngõ 198B đường Nguyễn Tuân, P Nhân Chính, Thanh Xuân, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0915833336',
    description: 'Bán hàng PML Nhà thuôc Thúy Vân',
    total: 1_425_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5928',
    orderDate: '2026-05-21',
    misaCode: 'PML0020',
    customerName: 'PML Quầy Thuốc Nguyễn Bảo Hân',
    saleName: 'Halo VN',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'thôn sen trì, xã bình yên, thạch thất, hà nội',
    province: 'Hà Nội',
    ward: 'Xã Thạch Thất',
    phone: '0977131663',
    description: 'Bán hàng PML Quầy Thuốc Nguyễn Bảo Hân',
    total: 1_425_000,
    hasVat: false,
  },

  // ── 22/05 (8 đơn, skip XK5930) ────────────────────────────────────
  {
    orderCode: 'XK5929',
    orderDate: '2026-05-22',
    misaCode: 'Anh Khương',
    customerName: 'Anh Khương - Nguyễn Đức Khương',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'Số 26 hẻm 6/30/2 Đội Nhân, phường Ngọc Hà, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Ngọc Hà',
    phone: '0797999886',
    description: 'Bán hàng Anh Khương - Nguyễn Đức Khương (NEU_01 ×41)',
    total: 11_480_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5931',
    orderDate: '2026-05-22',
    misaCode: 'KH000039',
    customerName: 'Xuyến Phạm',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Quầy thuốc Tiến Xuyến, thôn 9, Xuân Du, Như Thanh, Thanh Hóa',
    province: 'Thanh Hóa',
    ward: 'Xã Như Thanh',
    phone: '0968082636',
    description: 'Bán hàng Xuyến Phạm - QT Tiến Xuyến',
    total: 1_425_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5932',
    orderDate: '2026-05-22',
    misaCode: 'KH00013',
    customerName: 'Diệu Hiền Nguyễn',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Thanh Trì',
    phone: '0866006586',
    description: 'Bán hàng Diệu Hiền Nguyễn (MH_02 ×39 + MH_03 ×24)',
    total: 37_185_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5933',
    orderDate: '2026-05-22',
    misaCode: 'KH00057',
    customerName: 'Chị Thúy Hằng',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Thôn Dương Xá, Xã Dương Quang, Mỹ Hào, Hưng Yên',
    province: 'Hưng Yên',
    ward: 'Phường Mỹ Hào',
    phone: '0333107963',
    description: 'Bán hàng Chị Thúy Hằng (đơn lớn — MH_01/02/03)',
    total: 41_310_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5934',
    orderDate: '2026-05-22',
    misaCode: 'KH00012',
    customerName: 'CÔNG TY CỔ PHẦN PHARMADI',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'NV3-38 TC5, Tân Triều, Huyện Thanh Trì, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Thanh Trì',
    phone: '0973928734',
    description: 'Bán hàng CTCP Pharmadi (MH_03 ×48 giá B2B 750k)',
    total: 36_000_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5935',
    orderDate: '2026-05-22',
    misaCode: 'KH000040',
    customerName: 'Chị Lê Hường',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Số 4/20 Ngô Quyền Vạn Phúc Hà Đông Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Hà Đông',
    phone: '0929898585',
    description: 'Bán hàng Chị Lê Hường',
    total: 3_825_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5936',
    orderDate: '2026-05-22',
    misaCode: 'KH000041',
    customerName: 'Chị Huệ - HỘ KINH DOANH NGUYỄN THỊ HUỆ',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'SN 23 chợ Đồng Than, Yên Mỹ, Hưng Yên',
    province: 'Hưng Yên',
    ward: 'Xã Yên Mỹ',
    phone: '0969775856',
    description: 'Bán hàng Chị Huệ - HKD Nguyễn Thị Huệ',
    total: 3_120_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5937',
    orderDate: '2026-05-22',
    misaCode: 'PML0021',
    customerName: 'PML Nhà thuốc Nhật Sang 3',
    saleName: 'Halo VN',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Số 1013 Nguyễn Xiển, Long Bình, Thủ Đức, TP HCM',
    province: 'TP HCM',
    ward: 'Phường Long Bình',
    phone: '0901345233',
    description: 'Bán hàng PML Nhà thuốc Nhật Sang 3',
    total: 1_425_000,
    hasVat: false,
  },

  // ── 23/05 (1 đơn, skip XK5939 + XK5940) ───────────────────────────
  {
    orderCode: 'XK5938',
    orderDate: '2026-05-23',
    misaCode: 'KH00002',
    customerName: 'Chị Hiền Nguyễn',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '328/56 Nguyễn Trãi, Thanh Xuân Trung, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0971299996',
    description: 'Bán hàng Chị Hiền Nguyễn (BIO_07 ×24)',
    total: 14_472_000,
    hasVat: false,
  },
];

const ITEMS: LineItem[] = [
  // ── XK5919 (Pharceco — đa SKU + tặng VAG_001) ────────────────────
  { orderCode: 'XK5919', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 7,  unitPrice: 285_000, lineTotal: 1_995_000 },
  { orderCode: 'XK5919', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 10, unitPrice: 765_000, lineTotal: 7_650_000 },
  { orderCode: 'XK5919', sku: 'VAG_001', productName: 'Dung dịch vệ sinh Vagisil 240ml (Hồng)', unit: 'Chai', quantity: 1, unitPrice: 0, lineTotal: 0, isGift: true },

  // ── 21/05 đơn lẻ ────────────────────────────────────────────────
  { orderCode: 'XK5920', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'XK5921', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 290_000, lineTotal: 1_450_000 },
  { orderCode: 'XK5921', sku: 'MH_05',   productName: 'Vitavea FORCE G Libido 60 viên',    unit: 'Hộp', quantity: 1,  unitPrice: 445_000, lineTotal:   445_000 },
  { orderCode: 'XK5922', sku: 'BIO_07',  productName: 'Bioisland Milk Canxi Bon Care 150v',unit: 'Hộp', quantity: 5,  unitPrice: 610_000, lineTotal: 3_050_000 },
  { orderCode: 'XK5923', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 4,  unitPrice: 740_000, lineTotal: 2_960_000 },
  { orderCode: 'XK5924', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 10, unitPrice: 285_000, lineTotal: 2_850_000 },
  // XK5925 có VAT 8% → unitPrice CÓ VAT 285k (= 263_888.89 × 1.08)
  { orderCode: 'XK5925', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'XK5926', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'XK5927', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'XK5928', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000 },

  // ── 22/05 ──────────────────────────────────────────────────────
  { orderCode: 'XK5929', sku: 'NEU_01',  productName: 'Neubiotics Her 30 viên',            unit: 'Hộp', quantity: 41, unitPrice: 280_000, lineTotal: 11_480_000 },
  { orderCode: 'XK5931', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'XK5932', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 39, unitPrice: 495_000, lineTotal: 19_305_000 },
  { orderCode: 'XK5932', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 24, unitPrice: 745_000, lineTotal: 17_880_000 },
  { orderCode: 'XK5933', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 39, unitPrice: 495_000, lineTotal: 19_305_000 },
  { orderCode: 'XK5933', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 24, unitPrice: 745_000, lineTotal: 17_880_000 },
  { orderCode: 'XK5933', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 15, unitPrice: 275_000, lineTotal:  4_125_000 },
  { orderCode: 'XK5934', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 48, unitPrice: 750_000, lineTotal: 36_000_000 },
  { orderCode: 'XK5935', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 765_000, lineTotal:  3_825_000 },
  { orderCode: 'XK5936', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 6,  unitPrice: 520_000, lineTotal:  3_120_000 },
  { orderCode: 'XK5937', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },

  // ── 23/05 ──────────────────────────────────────────────────────
  { orderCode: 'XK5938', sku: 'BIO_07',  productName: 'Bioisland Milk Canxi Bon Care 150v',unit: 'Hộp', quantity: 24, unitPrice: 603_000, lineTotal: 14_472_000 },
];

async function main(): Promise<void> {
  console.log(`Import 21-24/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  const itemsByCode = new Map<string, LineItem[]>();
  for (const it of ITEMS) {
    const arr = itemsByCode.get(it.orderCode) ?? [];
    arr.push(it);
    itemsByCode.set(it.orderCode, arr);
  }
  for (const o of ORDERS) {
    const items = itemsByCode.get(o.orderCode) ?? [];
    const sum = items.reduce((s, i) => s + i.lineTotal, 0);
    if (sum !== o.total) {
      throw new Error(`Tổng line items của ${o.orderCode} = ${sum.toLocaleString('vi-VN')} ≠ header ${o.total.toLocaleString('vi-VN')}`);
    }
  }
  console.log(`✓ Header totals match line items (${ORDERS.length} đơn / ${ITEMS.length} dòng)`);

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');
  console.log(`Org: ${org.name}`);

  const users = await prisma.user.findMany({
    where: { orgId: org.id },
    select: { id: true, fullName: true, role: true },
  });
  const userByName = new Map(users.map((u) => [u.fullName.toLowerCase(), u.id]));
  const adminUser = users.find((u) => u.role === 'owner') ?? users.find((u) => u.role === 'admin');
  if (!adminUser) throw new Error('No admin/owner user');

  const allSkus = Array.from(new Set(ITEMS.map((i) => i.sku)));
  const products = await prisma.product.findMany({
    where: { orgId: org.id, sku: { in: allSkus } },
    select: { id: true, sku: true, costPrice: true },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  for (const sku of allSkus) {
    if (!productBySku.has(sku)) console.warn(`  ⚠ SKU ${sku} not in catalog`);
  }

  const existingOrders = await prisma.order.findMany({
    where: { orgId: org.id, orderCode: { in: ORDERS.map((o) => o.orderCode) } },
    select: { orderCode: true, id: true },
  });
  const existingOrderCodes = new Set(existingOrders.map((o) => o.orderCode));

  const existingContacts = await prisma.contact.findMany({
    where: {
      orgId: org.id,
      OR: [
        { misaCustomerCode: { in: ORDERS.map((o) => o.misaCode) } },
        { fullName: { in: ORDERS.map((o) => o.customerName) } },
      ],
    },
    select: { id: true, misaCustomerCode: true, fullName: true },
  });
  const contactByMisa = new Map(existingContacts.filter((c) => c.misaCustomerCode).map((c) => [c.misaCustomerCode!, c.id]));
  const contactByName = new Map(existingContacts.map((c) => [c.fullName, c.id]));

  console.log('\n─── DIFF ─────────────────────────────────────────────────');
  let toCreateOrder = 0, toSkipOrder = 0;
  let toCreateContact = 0, toReuseContact = 0;
  let unmatchedSale = 0;

  let currentDate = '';
  for (const o of ORDERS) {
    if (o.orderDate !== currentDate) {
      currentDate = o.orderDate;
      console.log(`\n  ─── ${currentDate} ───`);
    }
    const exists = existingOrderCodes.has(o.orderCode);
    const contactId = contactByMisa.get(o.misaCode) ?? contactByName.get(o.customerName);
    const reuseContact = !!contactId;
    const saleMatched = o.saleName ? userByName.has(o.saleName.toLowerCase()) : false;
    const hasGift = (itemsByCode.get(o.orderCode) ?? []).some((it) => it.isGift);

    if (exists) toSkipOrder++; else toCreateOrder++;
    if (reuseContact) toReuseContact++; else toCreateContact++;
    if (!saleMatched) unmatchedSale++;

    console.log(
      `  ${exists ? '⏭ ' : '➕'} ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ` +
      `${o.paymentPaid ? '💰 đã TT' : '🕗 nợ   '} ` +
      `${o.hasVat ? '🧾VAT ' : '     '}` +
      `| sale: ${saleMatched ? '✓' : '→Admin'} ${(o.saleName || '(trống)').padEnd(20)} ` +
      `| contact: ${reuseContact ? 'reuse' : 'CREATE'} ${o.customerName.slice(0, 35)}` +
      `${hasGift ? ' 🎁' : ''}`
    );
  }

  const headerSum = ORDERS.reduce((s, o) => s + o.total, 0);
  let costSum = 0;
  for (const it of ITEMS) {
    const p = productBySku.get(it.sku);
    if (p?.costPrice) costSum += Number(p.costPrice) * it.quantity;
  }
  const debtSum = ORDERS.filter((o) => !o.paymentPaid).reduce((s, o) => s + o.total, 0);
  const paidSum = ORDERS.filter((o) => o.paymentPaid).reduce((s, o) => s + o.total, 0);

  console.log('\nSummary:');
  console.log(`  Orders:   create ${toCreateOrder}, skip(existing) ${toSkipOrder}`);
  console.log(`  Contacts: create ${toCreateContact}, reuse ${toReuseContact}`);
  console.log(`  Sale:     matched ${ORDERS.length - unmatchedSale}/${ORDERS.length} (rest → Admin)`);
  console.log(`  Items:    ${ITEMS.length} rows (${ITEMS.filter((i) => i.isGift).length} gift)`);
  console.log(`  Doanh thu (có VAT):       ${headerSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Đã thu:               ${paidSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Còn nợ:               ${debtSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Giá vốn (DB cost_price):  ${costSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Lãi gộp:                  ${(headerSum - costSum).toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Margin:                   ${((headerSum - costSum) / headerSum * 100).toFixed(2)}%`);
  console.log('');
  console.log(`  ⚠ XK5940 (37.750.000đ, KH Chị Hoàng Hoa) — SKIP, thiếu line items.`);
  console.log(`     Cần anh Philip check MISA bổ sung sau.`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────');

  const touchedContacts = new Set<string>();

  for (const o of ORDERS) {
    if (existingOrderCodes.has(o.orderCode)) {
      console.log(`  ⏭  ${o.orderCode} đã tồn tại — skip`);
      continue;
    }

    const saleId = o.saleName ? (userByName.get(o.saleName.toLowerCase()) ?? adminUser.id) : adminUser.id;

    let contactId = contactByMisa.get(o.misaCode) ?? contactByName.get(o.customerName);
    if (!contactId) {
      const fullAddress = [o.address, o.ward].filter(Boolean).join(', ') || null;
      const c = await prisma.contact.create({
        data: {
          orgId: org.id,
          misaCustomerCode: o.misaCode,
          fullName: o.customerName,
          phone: o.phone || null,
          address: fullAddress,
          province: o.province || null,
          source: 'misa_import',
          assignedUserId: saleId,
        },
        select: { id: true },
      });
      contactId = c.id;
      contactByMisa.set(o.misaCode, contactId);
      contactByName.set(o.customerName, contactId);
      console.log(`  ➕ contact: ${o.customerName} (id=${contactId})`);
    }
    touchedContacts.add(contactId);

    const lineItems = itemsByCode.get(o.orderCode) ?? [];
    const paidAmount = o.paymentPaid ? o.total : 0;
    const debtAmount = o.paymentPaid ? 0 : o.total;
    const orderDate = new Date(`${o.orderDate}T00:00:00`);

    const order = await prisma.order.create({
      data: {
        orgId: org.id,
        contactId,
        createdByUserId: adminUser.id,
        assignedSaleId: saleId,
        orderCode: o.orderCode,
        orderDate,
        status: 'completed',
        paymentMethod: o.paymentMethod,
        totalAmount: o.total,
        subtotalAmount: o.total,
        discountAmount: 0,
        totalAmountValue: o.total,
        paidAmount,
        debtAmountValue: debtAmount,
        internalNote: `Import từ Misa - ${o.description}`,
        productSkus: Array.from(new Set(lineItems.filter((it) => !it.isGift).map((it) => it.sku))),
        confirmedAt: orderDate,
        packedAt: orderDate,
        shippedAt: orderDate,
        completedAt: orderDate,
      },
      select: { id: true },
    });

    await prisma.orderItem.createMany({
      data: lineItems.map((it) => {
        const p = productBySku.get(it.sku)!;
        const unitCost = Number(p.costPrice ?? 0);
        const lineCost = unitCost * it.quantity;
        return {
          orderId: order.id,
          productId: p.id,
          sku: it.sku,
          productName: it.productName,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountValue: 0,
          lineTotal: it.lineTotal,
          costValue: lineCost,
          unitCost,
          lineCost,
          profit: it.lineTotal - lineCost,
          returnQty: 0,
          returnValue: 0,
        };
      }),
    });

    const giftCount = lineItems.filter((it) => it.isGift).length;
    console.log(
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ${o.paymentPaid ? '💰' : '🕗'}${o.hasVat ? '🧾' : ' '}  ${lineItems.length} items${giftCount ? ` (${giftCount} gift)` : ''}  sale=${o.saleName || '(trống)'}`
    );
  }

  console.log('\nSyncing contact.lastOrderDate…');
  for (const cid of touchedContacts) {
    const last = await prisma.order.findFirst({
      where: { contactId: cid, status: 'completed' },
      orderBy: { orderDate: 'desc' },
      select: { orderDate: true },
    });
    if (last?.orderDate) {
      await prisma.contact.update({
        where: { id: cid },
        data: { lastOrderDate: last.orderDate },
      });
    }
  }
  console.log(`  ✓ Synced ${touchedContacts.size} contacts`);

  console.log('\n✅ Import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
