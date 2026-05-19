# MISA Re-import Report — Range 01-18/05/2026

**Ngày thực hiện:** 19/05/2026
**Operator:** Claude (theo yêu cầu anh Philip)
**Script chính:** `backend/scripts/reimport-misa-2026-05-01-18.ts`

---

## 1. Phạm vi & lý do

Anh Philip phát hiện data CRM tháng 5 đang lệch so với MISA do:
- Có đơn nháp lẫn trong DB (`XK5832` Nga Lâm 7.065.000đ)
- Một số đơn em đã import nhưng MISA đã xoá sau đó (`XK5767, XK5837, XK5860, XK5866, XK5883`)
- `products.cost_price` trong DB lệch với cost thực tế ở nhiều SKU (đặc biệt BIO_06, BIO_07, MH_05)

→ Yêu cầu re-import toàn bộ 01-18/05 với data sạch từ MISA + bảng giá vốn mới.

---

## 2. Trước/Sau

| Item | Trước | Sau |
|---|---|---|
| Số đơn trong range 1-18/5 | 113 (gồm XK5832 nháp) | **121** (sạch) |
| Tổng doanh số | 2.180.197.000đ (cộng cả 2.85M shipped) | **2.341.641.000đ** |
| Đơn nháp XK5832 | ✗ Có trong DB | ✅ Đã xoá |
| products.cost_price | Cũ (DB initial) | ✅ Updated theo Bảng giá vốn 1/5/2026 |
| Đơn 28-30/4 (XK5760-5766) | Giữ nguyên | Giữ nguyên (ngoài range) |

---

## 3. Records đã xoá / import

### Xoá:
- **113 orders** (XK5767 → XK5887, range 1-18/5)
- **160 order_items**
- 0 order_item_batches (chưa có FIFO tracking)
- 0 contacts (giữ KH cũ + chỉ tạo mới khi import)

### Import lại:
- **121 orders** (XK5768 → XK5899, KHÔNG có XK5832)
- **172 line items**
- **8 contacts tạo mới**, 113 reuse

---

## 4. Đơn nháp đã loại

| Mã | Ngày | Khách | Sale | Total |
|---|---|---|---|---|
| **XK5832** | 11/5 | Nga Lâm - HKD Nhà Thuốc Nga Sơn | Hoàng Bích Huế | 7.065.000đ |

→ Verify SQL: `SELECT COUNT(*) FROM orders WHERE order_code='XK5832';` = **0** ✅

---

## 5. SP không match

✅ **Tất cả 17 SKU trong file đều có trong DB & có cost_price**.

Không có SP cần tạo mới.

---

## 6. KH tạo mới (8 KH)

Script `reimport-misa-2026-05-01-18.ts --apply` đã tạo 8 contact mới khi import (do mã KH MISA chưa có trong DB). Chi tiết cụ thể từng KH có trong log apply.

---

## 7. Bảng giá vốn áp dụng từ 01/05/2026

Update vào `products.cost_price` (16 SKU, đơn 28-30/4 không bị ảnh hưởng vì đã có line_cost hardcoded từ trước):

| SKU | Cost trước | Cost mới (Bảng anh) | Lệch |
|---|---|---|---|
| MH_01 | 242.778đ | **240.000đ** | -2.778đ |
| MH_02 | 436.000đ | 436.000đ | giữ |
| MH_03 | 655.000đ | 655.000đ | giữ |
| MH_04 | 190.000đ | **195.000đ** | +5.000đ |
| MH_05 | 346.000đ | **381.000đ** | +35.000đ |
| MH_07 | 270.000đ | **285.000đ** | +15.000đ |
| MH_09 | 330.000đ | 330.000đ | giữ |
| BIO_01 | 350.000đ | **511.000đ** | +161.000đ |
| BIO_02 | 396.000đ | **462.000đ** | +66.000đ |
| BIO_05 | 495.000đ | **577.500đ** | +82.500đ |
| BIO_06 | 541.200đ | **630.000đ** | +88.800đ |
| BIO_07 | 501.600đ | **588.000đ** | +86.400đ |
| OTB01 | 340.000đ | 340.000đ | giữ |
| OTB02 | 748.000đ | 748.000đ | giữ |
| NEU_01 | 265.000đ | 265.000đ | giữ |
| VAG_001 | 137.000đ | **148.000đ** | +11.000đ |

**INC_02T (246.017đ) và INC_01TRANG (236.414đ)** không có trong Bảng giá vốn — giữ cost cũ trong DB.

---

## 8. Tổng kết doanh số 01-18/5/2026

| Chỉ số | Giá trị |
|---|---|
| **Doanh số (gross w/VAT)** | **2.341.641.000đ** |
| Doanh số (net, theo SCT) | 2.341.535.444đ |
| Chênh lệch | 105.556đ = VAT đơn XK5858 (Phạm Trang Nhung) |
| Giá vốn (theo cost mới) | 2.079.821.169đ |
| **Lãi gộp** | **261.714.275đ** (theo SCT net) |
| **Biên LN** | **11.18%** |

⚠ **Biên LN thực 11.18% — thấp hơn nhiều so với kỳ vọng 30-50%.** Lý do:
- MH_03 chiếm 46% doanh thu (1.086M / 2.341M), margin chỉ ~12% (bán 730-770k vs cost 655k)
- MH_01 chiếm 30%, margin ~11%
- 2 đơn BIO_06/BIO_07 thực sự LỖ (bán giá thấp hơn cost mới):
  - BIO_07: 48 hộp × 581k bán vs cost 588k → -346k
  - BIO_06: 30 hộp bán bằng cost 630k → -10k
- INC_01TRANG + VAG_001 là quà tặng (lineTotal=0, cost dương → âm)

→ **Nếu margin 30-50% là target, anh cần xem lại chính sách giá** (đặc biệt MH_03, BIO_06, BIO_07 đang gần huề/lỗ với cost mới).

### Doanh số theo ngày

| Ngày | Số đơn | Doanh số |
|---|---|---|
| 03/5 | 5 | 122.110.000đ |
| 04/5 | 12 | 371.740.000đ |
| 05/5 | 10 | 108.300.000đ |
| **06/5** | **12** | **439.774.000đ** ← Cao nhất |
| 07/5 | 6 | 174.308.000đ |
| 08/5 | 4 | 11.560.000đ |
| 09/5 | 10 | 147.075.000đ |
| 10/5 | 2 | 2.850.000đ |
| 11/5 | 6 | 67.965.000đ |
| 12/5 | 11 | 64.400.000đ |
| 13/5 | 9 | 319.056.000đ |
| 14/5 | 5 | 17.880.000đ |
| 15/5 | 14 | 205.849.000đ |
| 16/5 | 4 | 90.653.000đ |
| 18/5 | 11 | 198.121.000đ |

### DS theo Sale (khớp 100% target anh)

| Sale | Số đơn | Doanh số |
|---|---|---|
| Lê Huỳnh Đức | 46 | **1.443.556.000đ** (61.6%) |
| Halo VN (→Admin) | 25 | 659.618.000đ |
| Nguyễn Thành Đạt | 14 | 130.227.000đ |
| Hoàng Bích Huế | 18 | 59.770.000đ |
| Phí Hữu Luận | 17 | 47.045.000đ |
| (trống → Admin) | 1 | 1.425.000đ |

### Top 10 Khách hàng

| Hạng | KH | Số đơn | Doanh số |
|---|---|---|---|
| 1 | **Chị Đỗ Tuyền** | 8 | **604.798.000đ** |
| 2 | Chị Flora Thanh Huế | 3 | 476.220.000đ |
| 3 | PHARMADI | 4 | 354.795.000đ |
| 4 | Di Di (Yến Nhi) | 4 | 130.945.000đ |
| 5 | HP COSMETIC | 1 | 94.020.000đ |
| 6 | Quầy thuốc Minh Hằng | 1 | 45.976.000đ |
| 7 | THẾ THẢO PHARMA | 4 | 43.375.000đ |
| 8 | CHU PHUONG LINH | 1 | 41.700.000đ |
| 9 | Võ Thị Nam (XNK CUỘC SỐNG MỚI) | 1 | 39.390.000đ |
| 10 | Chị Hoàng Hoa | 1 | 36.240.000đ |

### Top SP (theo doanh thu)

| SKU | Tên rút gọn | SL | Doanh thu | Lãi gộp |
|---|---|---|---|---|
| MH_03 | Manhae 90v | 1.465 | 1.086.125.000đ | 126.550.000đ |
| MH_01 | Manhae 30v | 2.571 | 694.027.444đ | 76.987.444đ |
| MH_02 | Manhae 60v | 874 | 427.680.000đ | 46.616.000đ |
| BIO_07 | Bioisland Milk Canxi | 48 | 27.878.000đ | **-346.000đ** ⚠ |
| MH_05 | Vitavea Force G | 45 | 19.325.000đ | 2.180.000đ |
| BIO_06 | Bioisland DHA bầu | 30 | 18.890.000đ | **-10.000đ** ⚠ |
| MH_07 | Manhae Intima | 53 | 18.350.000đ | 3.245.000đ |
| OTB02 | Optibac 90v | 20 | 15.330.000đ | 370.000đ |
| OTB01 | Optibac 30v | 34 | 11.900.000đ | 340.000đ |
| INC_02T | Pro Flosser X6 | 15 | 7.245.000đ | 3.554.745đ |
| MH_09 | Collagen Expert | 15 | 6.582.000đ | 1.632.000đ |
| NEU_01 | Neubiotics Her | 15 | 4.375.000đ | 400.000đ |
| MH_04 | Manhae bầu | 15 | 3.625.000đ | 700.000đ |
| PBB_01 | BOBO 100ml | 1 | 108.000đ | 13.750đ |
| PBB_001 | BOBO 50ml | 1 | 95.000đ | 13.750đ |
| INC_01TRANG | Flosser X3A (gift) | 1 | 0đ | -236.414đ |
| VAG_001 | Vagisil (gift) | 2 | 0đ | -296.000đ |

---

## 9. 11 Checkpoints Verify (RULE 4)

- [x] Backup DB thành công, file 2.2MB (>1MB) — `backup_before_misa_reimport_20260519_0950.sql`
- [x] 121 đơn được import (không có XK5832) — verified SELECT COUNT = 0 cho XK5832
- [x] Tổng tiền khớp target — 2.341.641.000đ (theo gross w/VAT) hoặc 2.341.535.444đ (theo SCT net)
- [x] 5 sale có đủ đơn theo kỳ vọng — khớp 100%
- [⚠] Biên LN: thực 11.18% (kỳ vọng 30-50%) — KHÔNG đạt target. Em đã verify cost đúng theo Bảng giá vốn. Đề xuất review chính sách giá.
- [x] contact.last_order_date updated — sync 92 contacts (anh chỉ có column này, không có total_value/order_count)
- [x] XK5832 không tồn tại — verified
- [ ] Dashboard "Tháng này" — anh tự mở http://localhost:5173/ để verify
- [x] Top 10 KH — Chị Đỗ Tuyền top 1 (604.8M)
- [x] Top SP — MH_03 top 1 (1.086 tỷ)
- [x] docs/MISA_REIMPORT_REPORT.md — file này

---

## 10. Files thay đổi

**Tạo mới:**
- `backend/scripts/reimport-misa-2026-05-01-18.ts` (script re-import)
- `backend/backups/backup_before_misa_reimport_20260519_0950.sql` (backup, 2.2MB)
- `/tmp/misa_1_18_5.json` (Excel → JSON intermediate, 99KB)
- `docs/MISA_REIMPORT_REPORT.md` (file này)

**DB changes:**
- `products.cost_price`: updated 16 SKU theo Bảng giá vốn 1/5/2026
- `orders`: -113 rows (XK5767→5887 range), +121 rows (XK5768→5899 SCT)
- `order_items`: -160 rows, +172 rows
- `contacts`: +8 mới, sync last_order_date cho 92 KH

---

## 11. Đề xuất hành động tiếp theo

1. **Review chính sách giá** cho BIO_06, BIO_07: hiện đang gần huề/lỗ. Nếu cost 588k/630k là đúng → cần tăng giá bán hoặc ngưng nhập.
2. **MH_03 margin 12%**: nếu kỳ vọng 30-50% → đàm phán giảm cost NCC, hoặc tăng giá bán, hoặc chấp nhận margin TPCN Pháp thực tế.
3. **Workflow MISA**: kế toán cần check Sổ chi tiết khớp Ban_hang trước khi gửi anh. Pattern XK5832/XK5864/XK5869 lặp lại nhiều → có thể automate cảnh báo.
4. **Update Cost Registry TS file** (`backend/scripts/sku-cost-registry.ts`) để khớp `products.cost_price` mới — em sẽ làm trong commit kế tiếp.
