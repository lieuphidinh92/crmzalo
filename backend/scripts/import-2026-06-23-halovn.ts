/**
 * Import 64 đơn HaloVN bán sỉ (06/05/2026 → 23/06/2026) từ file
 * "HaloVN_ban_si_23_6_DA_DIEN_MAKH.xlsx" do anh Philip chuẩn bị.
 *
 * Quy tắc anh Philip chốt (23/06/2026):
 *   1. Đơn thiếu ngày → lấy ngày của đơn liền trên (forward-fill).
 *   2. Đơn thiếu tên/SĐT KH → lấy của đơn liền trên (forward-fill).
 *   3. Lệch đơn giá × số lượng ≠ thành tiền → ép theo công thức qty × unit.
 *   4. Đơn ngày <=17/06 mà DB chưa có → coi là đơn mới, import thêm.
 *   5. Giá vốn lấy từ sku-cost-registry (KHÔNG từ file Excel).
 *   6. Khớp khách: ưu tiên customer_code (Excel ghi sẵn KH001..KH252),
 *      nếu không có thì khớp SĐT chuẩn hoá; cuối cùng tạo KH mới
 *      (mã KH253..KH268).
 *   7. Mã đơn: liên tục theo tháng — DH-202605-0008..0017 (10 đơn),
 *      DH-202606-0069..0122 (54 đơn).
 *   8. Idempotent: skip đơn nếu orderCode đã tồn tại.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-2026-06-23-halovn.ts          # dry-run
 *   npx tsx --env-file=.env scripts/import-2026-06-23-halovn.ts --apply  # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { getSkuCost } from './sku-cost-registry.js';
import { resolveOrCreateProducts } from '../src/modules/products/product-import-resolver.js';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const normPhone = (p: string): string => (p || '').split('(')[0].replace(/[^0-9]/g, '');

type Status = 'confirmed' | 'shipping' | 'completed';

interface NewContact {
  key: string;
  customerCode: string;
  fullName: string;
  phone: string;
  address: string;
  saleName: string;
}

interface OrderHeader {
  orderCode: string;
  orderDate: string;
  saleName: string;
  customerCode: string;
  matchByPhone?: string;
  status: Status;
  debtDueDate?: string;
  trackingCode?: string;
  isPaidUpfront?: boolean;
  note: string;
  total: number;
}

interface LineItem {
  orderCode: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

const NEW_CONTACTS: NewContact[] = [
  { key: '0383423895', customerCode: 'KH253', fullName: 'Ken Phạm - HKD Phạm Cường', phone: '0383423895', address: '50C Hoa Cau, Phường Cầu Kiệu, Tp. Hồ Chí Minh', saleName: 'Lê Huỳnh Đức' },
  { key: '0947128051', customerCode: 'KH254', fullName: 'Chị Sầm Hồng', phone: '0947128051', address: 'Khoa khám Bệnh\nBệnh viện đa khoa Tỉnh Cao Bằng\nPhường Tân Giang - Tỉnh Cao Bằng', saleName: 'Nguyễn Thành Đạt' },
  { key: '0968284625', customerCode: 'KH255', fullName: 'Trần Thị Mỹ Hạnh', phone: '0968284625', address: ':-h', saleName: 'Nguyễn Thành Đạt' },
  { key: '0964983206', customerCode: 'KH256', fullName: 'PML Quầy Thuốc Phúc An', phone: '0964983206', address: 'đường tránh thôn Tân Ninh, Phường 3 Bảo Lộc, Lâm Đồng nha c', saleName: '' },
  { key: '0386086320', customerCode: 'KH257', fullName: 'Chị Lương Hà', phone: '0386086320', address: 'PKĐK Hào Thơm\nKhu đô thị mới, Mỹ Thái, Bắc Ninh', saleName: 'Nguyễn Thành Đạt' },
  { key: '0931886145', customerCode: 'KH258', fullName: 'Thu Thảo cosmetic', phone: '0931886145', address: '1A Phan Đình Phùng, p. Hiệp Phú, Tp. Thủ Đức', saleName: 'Mai Hiền' },
  { key: '0386869304', customerCode: 'KH259', fullName: 'Chị Hàm Thị Sang', phone: '0386869304', address: 'Thôn 2, xã Nâm Jang, huyện Đắk Song, tỉnh Đắk Nông', saleName: 'Nguyễn Thành Đạt' },
  { key: '0355984007', customerCode: 'KH260', fullName: 'Chị Vũ Thị Thảo', phone: '0355984007', address: 'Thảo mộc spa. Khối phố văn hóa Triêm đông 1. Điện bàn. Đà nẵng', saleName: 'Mai Hiền' },
  { key: '0886593999', customerCode: 'KH261', fullName: 'PML Quầy Thuốc Phương Đông', phone: '0886593999', address: 'Xóm 2, Xã Nghĩa Đồng, Nghệ An', saleName: '' },
  { key: '0866011088', customerCode: 'KH262', fullName: 'PML Công ty TNHH TM Thu Phương Pharma', phone: '0866011088', address: 'Nhà số 6 đường Nguyễn cao , kinh bắc, bắc ninh', saleName: '' },
  { key: '0938792688', customerCode: 'KH263', fullName: 'PML NT Hải Đăng', phone: '0938792688', address: 'Số 68 Lam Sơn, Phường Nhị Chiểu, Thành phố Hải Phòng', saleName: '' },
  { key: '0985217285', customerCode: 'KH264', fullName: 'Lâm Trà Boganic', phone: '0985217285', address: 'ngõ 3 lạc Long quân phường khai quang, Vĩnh yên, Vĩnh phúc', saleName: 'Lê Huỳnh Đức' },
  { key: '0869444255', customerCode: 'KH265', fullName: 'RIO Vũ thị vân', phone: '0869444255', address: 'thôn 5 thọ tân triệu sơn thanh hóa', saleName: '' },
  { key: '0964680115', customerCode: 'KH266', fullName: 'RIO Nguyễn Thị Thuỷ', phone: '0964680115', address: 'Thông Đường 23, Xã Tiến Thằng,Thành Phố Hà Nội', saleName: '' },
  { key: '0898267289', customerCode: 'KH267', fullName: 'RIO Nguyễn  Thu Hằng', phone: '0898267289', address: '69 phố mới tân dương-thuỷ nguyên- hải phòng', saleName: '' },
  { key: '0968543823', customerCode: 'KH268', fullName: 'RIO Thu Trang Lê', phone: '0968543823', address: '624 quang trung hà đông', saleName: '' },
];

const ORDERS: OrderHeader[] = [
  { orderCode: 'DH-202605-0008', orderDate: '2026-05-06', saleName: 'Lê Huỳnh Đức', customerCode: 'KH064', status: 'shipping', note: '', total: 18_120_000 },
  { orderCode: 'DH-202605-0009', orderDate: '2026-05-06', saleName: 'Lê Huỳnh Đức', customerCode: 'KH023', status: 'shipping', note: '', total: 40_560_000 },
  { orderCode: 'DH-202605-0010', orderDate: '2026-05-06', saleName: 'Lê Huỳnh Đức', customerCode: 'KH253', status: 'shipping', note: '', total: 85_080_000 },
  { orderCode: 'DH-202605-0011', orderDate: '2026-05-29', saleName: 'Hoàng Bích Huế', customerCode: 'KH209', status: 'confirmed', trackingCode: '143131335052', note: 'COD', total: 1_425_000 },
  { orderCode: 'DH-202605-0012', orderDate: '2026-05-29', saleName: 'Hoàng Bích Huế', customerCode: 'KH210', status: 'confirmed', trackingCode: '143129932837', note: 'COD', total: 4_900_000 },
  { orderCode: 'DH-202605-0013', orderDate: '2026-05-29', saleName: 'Hoàng Bích Huế', customerCode: 'KH211', status: 'confirmed', trackingCode: '143153321222', note: 'COD', total: 1_575_000 },
  { orderCode: 'DH-202605-0014', orderDate: '2026-05-29', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH212', status: 'completed', note: '', total: 9_180_000 },
  { orderCode: 'DH-202605-0015', orderDate: '2026-05-30', saleName: 'Lê Huỳnh Đức', customerCode: 'KH006', status: 'completed', isPaidUpfront: true, note: 'Khách đã thanh toán', total: 53_280_000 },
  { orderCode: 'DH-202605-0016', orderDate: '2026-05-30', saleName: 'Lê Huỳnh Đức', customerCode: 'KH062', status: 'completed', debtDueDate: '2026-06-09', note: 'Công nợ 10 ngày', total: 189_150_000 },
  { orderCode: 'DH-202605-0017', orderDate: '2026-05-30', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH254', status: 'completed', note: '', total: 2_600_000 },
  { orderCode: 'DH-202606-0069', orderDate: '2026-06-03', saleName: 'Lê Huỳnh Đức', customerCode: 'KH220', status: 'shipping', trackingCode: 'Viettel Post\n143521895586', note: '', total: 7_650_000 },
  { orderCode: 'DH-202606-0070', orderDate: '2026-06-03', saleName: '', customerCode: 'KH220', status: 'confirmed', note: '', total: 245_000 },
  { orderCode: 'DH-202606-0071', orderDate: '2026-06-03', saleName: '', customerCode: 'KH223', status: 'shipping', trackingCode: 'Viettel Post\n143519411440', note: '', total: 580_000 },
  { orderCode: 'DH-202606-0072', orderDate: '2026-06-03', saleName: '', customerCode: 'KH223', status: 'confirmed', note: '', total: 1_560_000 },
  { orderCode: 'DH-202606-0073', orderDate: '2026-06-04', saleName: 'Lê Huỳnh Đức', customerCode: 'KH012', status: 'completed', note: '', total: 7_100_000 },
  { orderCode: 'DH-202606-0074', orderDate: '2026-06-17', saleName: 'Lê Huỳnh Đức', customerCode: 'KH003', status: 'completed', note: '', total: 130_095_000 },
  { orderCode: 'DH-202606-0075', orderDate: '2026-06-17', saleName: '', customerCode: 'KH250', status: 'shipping', note: '', total: 3_825_000 },
  { orderCode: 'DH-202606-0076', orderDate: '2026-06-17', saleName: '', customerCode: 'KH251', status: 'completed', note: '', total: 88_800_000 },
  { orderCode: 'DH-202606-0077', orderDate: '2026-06-17', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH252', status: 'shipping', note: '', total: 18_915_000 },
  { orderCode: 'DH-202606-0078', orderDate: '2026-06-17', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH093', status: 'shipping', note: '', total: 7_500_000 },
  { orderCode: 'DH-202606-0079', orderDate: '2026-06-18', saleName: 'Mai Hiền', customerCode: 'KH096', status: 'shipping', note: '', total: 5_200_000 },
  { orderCode: 'DH-202606-0080', orderDate: '2026-06-18', saleName: 'Lê Huỳnh Đức', customerCode: 'KH133', status: 'completed', note: '', total: 220_000_000 },
  { orderCode: 'DH-202606-0081', orderDate: '2026-06-18', saleName: 'Lê Huỳnh Đức', customerCode: 'KH195', status: 'completed', note: '', total: 71_040_000 },
  { orderCode: 'DH-202606-0082', orderDate: '2026-06-18', saleName: 'Lê Huỳnh Đức', customerCode: 'KH062', status: 'completed', note: '', total: 177_600_000 },
  { orderCode: 'DH-202606-0083', orderDate: '2026-06-19', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH255', status: 'shipping', trackingCode: 'Viettel Post\n144831695819', note: '', total: 3_150_000 },
  { orderCode: 'DH-202606-0084', orderDate: '2026-06-19', saleName: 'Lê Huỳnh Đức', customerCode: 'KH178', status: 'shipping', note: '', total: 7_650_000 },
  { orderCode: 'DH-202606-0085', orderDate: '2026-06-19', saleName: 'Lê Huỳnh Đức', customerCode: 'KH002', status: 'completed', note: '', total: 9_111_000 },
  { orderCode: 'DH-202606-0086', orderDate: '2026-06-19', saleName: 'Lê Huỳnh Đức', customerCode: 'KH123', status: 'completed', note: '', total: 19_050_000 },
  { orderCode: 'DH-202606-0087', orderDate: '2026-06-19', saleName: 'Lê Huỳnh Đức', customerCode: 'KH041', status: 'shipping', note: '', total: 6_480_000 },
  { orderCode: 'DH-202606-0088', orderDate: '2026-06-19', saleName: 'Lê Huỳnh Đức', customerCode: 'KH017', status: 'completed', note: '', total: 17_880_000 },
  { orderCode: 'DH-202606-0089', orderDate: '2026-06-19', saleName: '', customerCode: 'KH256', status: 'shipping', trackingCode: 'Viettel Post\n144830087152', note: '', total: 1_500_000 },
  { orderCode: 'DH-202606-0090', orderDate: '2026-06-19', saleName: '', customerCode: 'KH023', status: 'shipping', trackingCode: 'Viettel Post\n144831949275"', note: '', total: 1_575_000 },
  { orderCode: 'DH-202606-0091', orderDate: '2026-06-20', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH087', status: 'completed', note: '', total: 7_550_000 },
  { orderCode: 'DH-202606-0092', orderDate: '2026-06-23', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH257', status: 'shipping', trackingCode: 'Viettel Post\n145115074748', note: '', total: 3_375_000 },
  { orderCode: 'DH-202606-0093', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH214', status: 'completed', note: '', total: 19_200_000 },
  { orderCode: 'DH-202606-0094', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH002', status: 'completed', note: '', total: 6_400_000 },
  { orderCode: 'DH-202606-0095', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH062', status: 'completed', note: '', total: 189_150_000 },
  { orderCode: 'DH-202606-0096', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH006', status: 'completed', note: '', total: 71_040_000 },
  { orderCode: 'DH-202606-0097', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH181', status: 'completed', note: '', total: 3_050_000 },
  { orderCode: 'DH-202606-0098', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH034', status: 'completed', note: '', total: 9_150_000 },
  { orderCode: 'DH-202606-0099', orderDate: '2026-06-23', saleName: '', customerCode: 'KH011', status: 'completed', note: '', total: 87_600_000 },
  { orderCode: 'DH-202606-0100', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH062', status: 'confirmed', note: '', total: 106_000_000 },
  { orderCode: 'DH-202606-0101', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH003', status: 'confirmed', note: '', total: 69_810_000 },
  { orderCode: 'DH-202606-0102', orderDate: '2026-06-23', saleName: '', customerCode: 'KH241', status: 'confirmed', note: '', total: 344_200_000 },
  { orderCode: 'DH-202606-0103', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH006', status: 'confirmed', note: '', total: 2_650_000 },
  { orderCode: 'DH-202606-0104', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH002', status: 'confirmed', note: '', total: 8_100_000 },
  { orderCode: 'DH-202606-0105', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH004', status: 'confirmed', note: '27/6 giao', total: 26_500_000 },
  { orderCode: 'DH-202606-0106', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH160', status: 'confirmed', note: '', total: 2_850_000 },
  { orderCode: 'DH-202606-0107', orderDate: '2026-06-23', saleName: 'Mai Hiền', customerCode: 'KH258', status: 'confirmed', note: '25/6 giao', total: 21_450_000 },
  { orderCode: 'DH-202606-0108', orderDate: '2026-06-23', saleName: 'Nguyễn Thành Đạt', customerCode: 'KH259', status: 'confirmed', note: '', total: 1_215_000 },
  { orderCode: 'DH-202606-0109', orderDate: '2026-06-23', saleName: '', customerCode: 'KH251', status: 'confirmed', note: '', total: 103_350_000 },
  { orderCode: 'DH-202606-0110', orderDate: '2026-06-23', saleName: 'Mai Hiền', customerCode: 'KH260', status: 'confirmed', note: '', total: 1_740_000 },
  { orderCode: 'DH-202606-0111', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH025', status: 'confirmed', note: '', total: 5_500_000 },
  { orderCode: 'DH-202606-0112', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH123', status: 'confirmed', note: '', total: 21_060_000 },
  { orderCode: 'DH-202606-0113', orderDate: '2026-06-23', saleName: '', customerCode: 'KH261', status: 'confirmed', note: '', total: 1_425_000 },
  { orderCode: 'DH-202606-0114', orderDate: '2026-06-23', saleName: '', customerCode: 'KH262', status: 'confirmed', note: '', total: 21_450_000 },
  { orderCode: 'DH-202606-0115', orderDate: '2026-06-23', saleName: '', customerCode: 'KH120', status: 'confirmed', note: '', total: 2_850_000 },
  { orderCode: 'DH-202606-0116', orderDate: '2026-06-23', saleName: '', customerCode: 'KH236', status: 'confirmed', note: '', total: 1_425_000 },
  { orderCode: 'DH-202606-0117', orderDate: '2026-06-23', saleName: '', customerCode: 'KH263', status: 'confirmed', note: '', total: 1_425_000 },
  { orderCode: 'DH-202606-0118', orderDate: '2026-06-23', saleName: 'Lê Huỳnh Đức', customerCode: 'KH264', status: 'confirmed', note: '', total: 8_100_000 },
  { orderCode: 'DH-202606-0119', orderDate: '2026-06-23', saleName: '', customerCode: 'KH265', status: 'shipping', note: '', total: 2_700_000 },
  { orderCode: 'DH-202606-0120', orderDate: '2026-06-23', saleName: '', customerCode: 'KH266', status: 'confirmed', note: '', total: 2_900_000 },
  { orderCode: 'DH-202606-0121', orderDate: '2026-06-23', saleName: '', customerCode: 'KH267', status: 'confirmed', note: '', total: 1_450_000 },
  { orderCode: 'DH-202606-0122', orderDate: '2026-06-23', saleName: '', customerCode: 'KH268', status: 'confirmed', note: '', total: 5_800_000 },
];

const ITEMS: LineItem[] = [
  { orderCode: 'DH-202605-0008', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 24, unitPrice: 755_000, lineTotal: 18_120_000 },
  { orderCode: 'DH-202605-0009', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 24, unitPrice: 745_000, lineTotal: 17_880_000 },
  { orderCode: 'DH-202605-0009', sku: 'MH_003', productName: 'Manhae Nutrisante 120 viên', quantity: 24, unitPrice: 945_000, lineTotal: 22_680_000 },
  { orderCode: 'DH-202605-0010', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 24, unitPrice: 725_000, lineTotal: 17_400_000 },
  { orderCode: 'DH-202605-0010', sku: 'MH_003', productName: 'Manhae Nutrisante 120 viên', quantity: 72, unitPrice: 940_000, lineTotal: 67_680_000 },
  { orderCode: 'DH-202605-0011', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 5, unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'DH-202605-0012', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 10, unitPrice: 290_000, lineTotal: 2_900_000 },
  { orderCode: 'DH-202605-0012', sku: 'MH_09', productName: 'Manhae Collagen Expert 30 viên', quantity: 5, unitPrice: 400_000, lineTotal: 2_000_000 },
  { orderCode: 'DH-202605-0013', sku: 'NEU_04', productName: 'Neubria Neu Kid 30 viên', quantity: 5, unitPrice: 315_000, lineTotal: 1_575_000 },
  { orderCode: 'DH-202605-0014', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 12, unitPrice: 765_000, lineTotal: 9_180_000 },
  { orderCode: 'DH-202605-0015', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 72, unitPrice: 740_000, lineTotal: 53_280_000 },
  { orderCode: 'DH-202605-0016', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 390, unitPrice: 485_000, lineTotal: 189_150_000 },
  { orderCode: 'DH-202605-0017', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 5, unitPrice: 520_000, lineTotal: 2_600_000 },
  { orderCode: 'DH-202606-0069', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 10, unitPrice: 765_000, lineTotal: 7_650_000 },
  { orderCode: 'DH-202606-0070', sku: 'MH_04', productName: 'Manhae Femmes enceintes Pregnant women 30 viên', quantity: 1, unitPrice: 245_000, lineTotal: 245_000 },
  { orderCode: 'DH-202606-0071', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 2, unitPrice: 290_000, lineTotal: 580_000 },
  { orderCode: 'DH-202606-0072', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 3, unitPrice: 520_000, lineTotal: 1_560_000 },
  { orderCode: 'DH-202606-0073', sku: 'HC_11', productName: 'Healthy Care Ultimate Omega 3-6-9 200 viên', quantity: 20, unitPrice: 355_000, lineTotal: 7_100_000 },
  { orderCode: 'DH-202606-0074', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 195, unitPrice: 485_000, lineTotal: 94_575_000 },
  { orderCode: 'DH-202606-0074', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 48, unitPrice: 740_000, lineTotal: 35_520_000 },
  { orderCode: 'DH-202606-0075', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 5, unitPrice: 765_000, lineTotal: 3_825_000 },
  { orderCode: 'DH-202606-0076', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 120, unitPrice: 740_000, lineTotal: 88_800_000 },
  { orderCode: 'DH-202606-0077', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 39, unitPrice: 485_000, lineTotal: 18_915_000 },
  { orderCode: 'DH-202606-0078', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 10, unitPrice: 750_000, lineTotal: 7_500_000 },
  { orderCode: 'DH-202606-0078', sku: 'PBB_001', productName: 'P\'tit BOBO Isotonic 50ml', quantity: 1, unitPrice: 0, lineTotal: 0 },
  { orderCode: 'DH-202606-0079', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 10, unitPrice: 520_000, lineTotal: 5_200_000 },
  { orderCode: 'DH-202606-0080', sku: 'NEU_01', productName: 'Men phụ khoa Neubiotics Her', quantity: 800, unitPrice: 275_000, lineTotal: 220_000_000 },
  { orderCode: 'DH-202606-0081', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 96, unitPrice: 740_000, lineTotal: 71_040_000 },
  { orderCode: 'DH-202606-0081', sku: 'PBB_001', productName: 'P\'tit BOBO Isotonic 50ml', quantity: 5, unitPrice: 0, lineTotal: 0 },
  { orderCode: 'DH-202606-0082', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 240, unitPrice: 740_000, lineTotal: 177_600_000 },
  { orderCode: 'DH-202606-0082', sku: 'PBB_001', productName: 'P\'tit BOBO Isotonic 50ml', quantity: 5, unitPrice: 0, lineTotal: 0 },
  { orderCode: 'DH-202606-0083', sku: 'NEU_04', productName: 'Neubria Neu Kid 30 viên', quantity: 10, unitPrice: 315_000, lineTotal: 3_150_000 },
  { orderCode: 'DH-202606-0084', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 10, unitPrice: 765_000, lineTotal: 7_650_000 },
  { orderCode: 'DH-202606-0084', sku: 'PBB_001', productName: 'P\'tit BOBO Isotonic 50ml', quantity: 1, unitPrice: 0, lineTotal: 0 },
  { orderCode: 'DH-202606-0085', sku: 'BIO_07', productName: 'Bioisland Milk Canxi Bon Care 150 viên', quantity: 12, unitPrice: 603_000, lineTotal: 7_236_000 },
  { orderCode: 'DH-202606-0085', sku: 'INC_03T', productName: 'Super Smart Electric Brush trắng', quantity: 5, unitPrice: 375_000, lineTotal: 1_875_000 },
  { orderCode: 'DH-202606-0086', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 15, unitPrice: 505_000, lineTotal: 7_575_000 },
  { orderCode: 'DH-202606-0086', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 15, unitPrice: 765_000, lineTotal: 11_475_000 },
  { orderCode: 'DH-202606-0087', sku: 'NEU_01', productName: 'Men phụ khoa Neubiotics Her', quantity: 6, unitPrice: 315_000, lineTotal: 1_890_000 },
  { orderCode: 'DH-202606-0087', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 6, unitPrice: 765_000, lineTotal: 4_590_000 },
  { orderCode: 'DH-202606-0088', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 24, unitPrice: 745_000, lineTotal: 17_880_000 },
  { orderCode: 'DH-202606-0089', sku: 'NEU_04', productName: 'Neubria Neu Kid 30 viên', quantity: 5, unitPrice: 300_000, lineTotal: 1_500_000 },
  { orderCode: 'DH-202606-0090', sku: 'NEU_04', productName: 'Neubria Neu Kid 30 viên', quantity: 5, unitPrice: 315_000, lineTotal: 1_575_000 },
  { orderCode: 'DH-202606-0091', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 10, unitPrice: 755_000, lineTotal: 7_550_000 },
  { orderCode: 'DH-202606-0091', sku: 'PBB_001', productName: 'P\'tit BOBO Isotonic 50ml', quantity: 1, unitPrice: 0, lineTotal: 0 },
  { orderCode: 'DH-202606-0092', sku: 'NEU_01', productName: 'Men phụ khoa Neubiotics Her', quantity: 5, unitPrice: 315_000, lineTotal: 1_575_000 },
  { orderCode: 'DH-202606-0092', sku: 'MH_07', productName: 'Manhae Intima Equilibre 30 viên', quantity: 5, unitPrice: 360_000, lineTotal: 1_800_000 },
  { orderCode: 'DH-202606-0093', sku: 'BIO_06', productName: 'Bioisland DHA bầu 60 viên', quantity: 30, unitPrice: 640_000, lineTotal: 19_200_000 },
  { orderCode: 'DH-202606-0094', sku: 'BIO_06', productName: 'Bioisland DHA bầu 60 viên', quantity: 10, unitPrice: 640_000, lineTotal: 6_400_000 },
  { orderCode: 'DH-202606-0095', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 390, unitPrice: 485_000, lineTotal: 189_150_000 },
  { orderCode: 'DH-202606-0096', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 96, unitPrice: 740_000, lineTotal: 71_040_000 },
  { orderCode: 'DH-202606-0097', sku: 'BIO_07', productName: 'Bioisland Milk Canxi Bon Care 150 viên', quantity: 5, unitPrice: 610_000, lineTotal: 3_050_000 },
  { orderCode: 'DH-202606-0098', sku: 'BIO_07', productName: 'Bioisland Milk Canxi Bon Care 150 viên', quantity: 15, unitPrice: 610_000, lineTotal: 9_150_000 },
  { orderCode: 'DH-202606-0099', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 120, unitPrice: 730_000, lineTotal: 87_600_000 },
  { orderCode: 'DH-202606-0100', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 400, unitPrice: 265_000, lineTotal: 106_000_000 },
  { orderCode: 'DH-202606-0101', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 234, unitPrice: 265_000, lineTotal: 62_010_000 },
  { orderCode: 'DH-202606-0101', sku: 'MH_07', productName: 'Manhae Intima Equilibre 30 viên', quantity: 24, unitPrice: 325_000, lineTotal: 7_800_000 },
  { orderCode: 'DH-202606-0102', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 800, unitPrice: 265_000, lineTotal: 212_000_000 },
  { orderCode: 'DH-202606-0102', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 120, unitPrice: 485_000, lineTotal: 58_200_000 },
  { orderCode: 'DH-202606-0102', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 100, unitPrice: 740_000, lineTotal: 74_000_000 },
  { orderCode: 'DH-202606-0103', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 10, unitPrice: 265_000, lineTotal: 2_650_000 },
  { orderCode: 'DH-202606-0104', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 30, unitPrice: 270_000, lineTotal: 8_100_000 },
  { orderCode: 'DH-202606-0105', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 100, unitPrice: 265_000, lineTotal: 26_500_000 },
  { orderCode: 'DH-202606-0106', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 10, unitPrice: 285_000, lineTotal: 2_850_000 },
  { orderCode: 'DH-202606-0107', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 78, unitPrice: 275_000, lineTotal: 21_450_000 },
  { orderCode: 'DH-202606-0108', sku: 'INC_01TRANG', productName: 'Ultra Flosser X3A màu trắng', quantity: 1, unitPrice: 0, lineTotal: 0 },
  { orderCode: 'DH-202606-0108', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 3, unitPrice: 405_000, lineTotal: 1_215_000 },
  { orderCode: 'DH-202606-0109', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 390, unitPrice: 265_000, lineTotal: 103_350_000 },
  { orderCode: 'DH-202606-0110', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 6, unitPrice: 290_000, lineTotal: 1_740_000 },
  { orderCode: 'DH-202606-0111', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 20, unitPrice: 275_000, lineTotal: 5_500_000 },
  { orderCode: 'DH-202606-0112', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 78, unitPrice: 270_000, lineTotal: 21_060_000 },
  { orderCode: 'DH-202606-0113', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 5, unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'DH-202606-0114', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 78, unitPrice: 275_000, lineTotal: 21_450_000 },
  { orderCode: 'DH-202606-0115', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 10, unitPrice: 285_000, lineTotal: 2_850_000 },
  { orderCode: 'DH-202606-0116', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 5, unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'DH-202606-0117', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 5, unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'DH-202606-0118', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 15, unitPrice: 285_000, lineTotal: 4_275_000 },
  { orderCode: 'DH-202606-0118', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 5, unitPrice: 765_000, lineTotal: 3_825_000 },
  { orderCode: 'DH-202606-0119', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 2, unitPrice: 770_000, lineTotal: 1_540_000 },
  { orderCode: 'DH-202606-0119', sku: 'MH_07', productName: 'Manhae Intima Equilibre 30 viên', quantity: 1, unitPrice: 360_000, lineTotal: 360_000 },
  { orderCode: 'DH-202606-0119', sku: 'MH_09', productName: 'Manhae Collagen Expert 30 viên', quantity: 2, unitPrice: 400_000, lineTotal: 800_000 },
  { orderCode: 'DH-202606-0120', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 10, unitPrice: 290_000, lineTotal: 2_900_000 },
  { orderCode: 'DH-202606-0121', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 5, unitPrice: 290_000, lineTotal: 1_450_000 },
  { orderCode: 'DH-202606-0122', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 20, unitPrice: 290_000, lineTotal: 5_800_000 },
];


async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No organization');
  const orgId = org.id;

  const saleNames = [...new Set(ORDERS.map((o) => o.saleName).concat(NEW_CONTACTS.map((c) => c.saleName)).filter((s): s is string => Boolean(s)))];
  const saleUsers = await prisma.user.findMany({ where: { orgId, fullName: { in: saleNames } }, select: { id: true, fullName: true } });
  const saleByName = new Map(saleUsers.map((u: any) => [u.fullName!, u.id]));

  // Admin/owner fallback cho createdByUserId (column required) khi đơn không
  // có sale cụ thể (vd "Admin" trong file Excel = anh Philip tự lên đơn).
  const ownerUser = await prisma.user.findFirst({ where: { orgId, role: 'owner' }, select: { id: true } });
  if (!ownerUser) throw new Error('Không tìm thấy owner user — không thể fallback createdBy');
  const ownerId = ownerUser.id;

  const allCodes = [...new Set(ORDERS.map((o) => o.customerCode).filter(Boolean))];
  const allPhones = [...new Set(ORDERS.map((o) => o.matchByPhone).filter((p): p is string => Boolean(p)))];
  const existingByCode = await prisma.contact.findMany({
    where: { orgId, customerCode: { in: allCodes } },
    select: { id: true, customerCode: true, phone: true, fullName: true },
  });
  const codeToContact = new Map(existingByCode.map((c: any) => [c.customerCode!, c]));

  const phoneLookup: Record<string, any> = {};
  if (allPhones.length) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; phone: string | null; customer_code: string | null; full_name: string | null }>>(`
      SELECT id, phone, customer_code, full_name FROM contacts
      WHERE org_id = $1 AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ANY($2::text[])
    `, orgId, allPhones);
    for (const r of rows) {
      const norm = (r.phone || '').replace(/[^0-9]/g, '');
      phoneLookup[norm] = r;
    }
  }

  const newContactIds = new Map<string, string>();
  for (const nc of NEW_CONTACTS) {
    const existsCode = await prisma.contact.findFirst({ where: { orgId, customerCode: nc.customerCode }, select: { id: true } });
    if (existsCode) {
      console.log(`[skip new contact] ${nc.customerCode} đã tồn tại (id=${existsCode.id})`);
      newContactIds.set(nc.key, existsCode.id);
      continue;
    }
    if (nc.phone) {
      const phoneRows = await prisma.$queryRawUnsafe<Array<{ id: string; customer_code: string | null }>>(`
        SELECT id, customer_code FROM contacts
        WHERE org_id = $1 AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = $2
        LIMIT 1
      `, orgId, nc.phone);
      if (phoneRows[0]) {
        console.log(`[skip new contact] SĐT ${nc.phone} đã có ở contact ${phoneRows[0].customer_code ?? phoneRows[0].id}`);
        newContactIds.set(nc.key, phoneRows[0].id);
        continue;
      }
    }
    if (!APPLY) {
      console.log(`[DRY] CREATE contact ${nc.customerCode}: ${nc.fullName} | SĐT ${nc.phone || '—'} | sale ${nc.saleName || '—'}`);
      newContactIds.set(nc.key, 'DRY-' + nc.customerCode);
      continue;
    }
    const created = await prisma.contact.create({
      data: {
        orgId, customerCode: nc.customerCode,
        fullName: nc.fullName, phone: nc.phone || null,
        address: nc.address || null,
        customerType: 'nha_thuoc',
        assignedUserId: saleByName.get(nc.saleName) ?? null,
        source: 'gioi_thieu',
        firstContactDate: new Date(),
      },
    });
    console.log(`[CREATED] contact ${nc.customerCode}: ${nc.fullName}`);
    newContactIds.set(nc.key, created.id);
  }

  // Mã SP mới → xác nhận trước khi tạo (CONFIRM_NEW_SKUS=1). Mặc định chỉ
  // liệt kê + cảnh báo trùng tên rồi DỪNG (không tạo). SP nháp tạo ra KHÔNG
  // có giá vốn — FIFO/cost-registry lo sau.
  const resolveRes = await resolveOrCreateProducts(
    prisma,
    orgId,
    ITEMS.map((i) => ({ sku: i.sku, name: i.productName })),
    { confirm: process.env.CONFIRM_NEW_SKUS === '1', createdById: ownerUser?.id ?? null },
  );
  if (resolveRes.missing.length && process.env.CONFIRM_NEW_SKUS !== '1') {
    process.exit(1);
  }
  const productBySku = resolveRes.productBySku;

  let createdOrders = 0, skipped = 0;
  let totalRevenue = 0n;
  for (const oh of ORDERS) {
    const exists = await prisma.order.findFirst({ where: { orgId, orderCode: oh.orderCode }, select: { id: true } });
    if (exists) {
      console.log(`[skip order] ${oh.orderCode} đã tồn tại`);
      skipped++;
      continue;
    }
    let contactId: string | undefined;
    const existing = codeToContact.get(oh.customerCode);
    if (existing) contactId = (existing as any).id;
    else if (oh.matchByPhone && phoneLookup[oh.matchByPhone]) contactId = phoneLookup[oh.matchByPhone].id;
    else {
      const nc = NEW_CONTACTS.find((c) => c.customerCode === oh.customerCode);
      if (nc) contactId = newContactIds.get(nc.key);
    }
    if (!contactId) {
      console.log(`[ERROR] Không tìm được contact cho ${oh.orderCode} (mã=${oh.customerCode})`);
      continue;
    }
    const items = ITEMS.filter((it) => it.orderCode === oh.orderCode);
    if (!items.length) {
      console.log(`[ERROR] ${oh.orderCode} không có items`);
      continue;
    }
    const itemRows = items.map((it) => {
      const productId = productBySku.get(it.sku);
      if (!productId) throw new Error(`SKU ${it.sku} không có trong DB`);
      const unitCost = getSkuCost(it.sku);
      const lineCost = unitCost * it.quantity;
      return {
        productId, sku: it.sku, productName: it.productName, unit: 'Hộp' as const,
        quantity: it.quantity, unitPrice: it.unitPrice, discountValue: 0,
        lineTotal: it.lineTotal, costValue: lineCost, unitCost, lineCost,
        profit: it.lineTotal - lineCost, returnQty: 0, returnValue: 0,
      };
    });
    const total = items.reduce((s, it) => s + it.lineTotal, 0);
    const isPaid = oh.isPaidUpfront ?? (oh.status === 'completed' && !oh.debtDueDate);
    const debt = isPaid ? 0 : total;
    const debtDue = oh.debtDueDate ? new Date(oh.debtDueDate + 'T00:00:00+07:00') : null;
    totalRevenue += BigInt(total);
    if (!APPLY) {
      console.log(`[DRY] ${oh.orderCode} | ${oh.orderDate} | ${oh.customerCode} | sale ${oh.saleName || '-'} | items ${items.length} | total ${total.toLocaleString('vi')} | ${oh.status} | debt ${debt.toLocaleString('vi')}`);
      createdOrders++;
      continue;
    }
    const paid = total - debt;
    const productSkus = [...new Set(items.map((it) => it.sku))];
    const orderDate = new Date(oh.orderDate + 'T00:00:00Z');
    const ts = {
      confirmedAt: orderDate,
      packedAt: oh.status === 'shipping' || oh.status === 'completed' ? orderDate : null,
      shippedAt: oh.status === 'shipping' || oh.status === 'completed' ? orderDate : null,
      completedAt: oh.status === 'completed' ? orderDate : null,
    };
    const saleUserId = saleByName.get(oh.saleName) ?? null;
    await prisma.order.create({
      data: {
        org: { connect: { id: orgId } },
        orderCode: oh.orderCode,
        orderDate,
        contact: { connect: { id: contactId } },
        createdBy: { connect: { id: saleUserId ?? ownerId } },
        ...(saleUserId ? { assignedSale: { connect: { id: saleUserId } } } : {}),
        status: oh.status,
        totalAmount: total,
        subtotalAmount: total,
        totalAmountValue: total,
        paidAmount: paid,
        debtAmountValue: debt,
        debtDueDate: debtDue,
        paymentMethod: debtDue ? 'credit' : 'cod',
        trackingCode: oh.trackingCode || null,
        shippingProvider: oh.trackingCode ? 'Viettel Post' : null,
        internalNote: `Import HaloVN 23/06${oh.note ? ' — ' + oh.note : ''}`,
        productSkus,
        ...ts,
        items: { create: itemRows },
      },
    });
    console.log(`[CREATED] ${oh.orderCode} | ${oh.orderDate} | ${oh.customerCode} | ${items.length} item(s) | total ${total.toLocaleString('vi')}`);
    createdOrders++;
  }

  if (APPLY) {
    await prisma.$executeRawUnsafe(`
      UPDATE contacts c
      SET last_order_date = sub.maxd
      FROM (
        SELECT contact_id, MAX(order_date) AS maxd
        FROM orders WHERE org_id = $1 AND status IN ('confirmed','shipping','completed')
        GROUP BY contact_id
      ) sub
      WHERE c.id = sub.contact_id AND c.org_id = $1;
    `, orgId);
    console.log('[UPDATED] contacts.last_order_date');
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Mode:           ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Đơn xử lý:      ${ORDERS.length}`);
  console.log(`  Tạo mới:        ${createdOrders}`);
  console.log(`  Skip (đã có):   ${skipped}`);
  console.log(`  Tổng doanh số:  ${totalRevenue.toLocaleString('vi')}đ`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
