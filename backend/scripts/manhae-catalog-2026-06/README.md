# Chuẩn hoá danh mục bán sỉ — áp dụng 1/6/2026

Nguồn: "BẢNG GIÁ SỈ MANHAE (1).xlsx" (6 nhãn: Manhae, Bioisland [GIÁ MỚI],
Optibac, Neubria, P'tit BOBO, Vitatree) → 26 SKU.

- `gen_sql.py`  : đọc Excel, sinh `apply-catalog.sql` (4 mức giá theo thùng).
- `apply-catalog.sql` : transaction cập nhật 26 SP (tên/giá vốn/ảnh/4 giá),
  bật active, và ẩn (discontinued) mọi SP active khác.

Nhóm giá theo sản lượng thùng: 10 thùng / 5 thùng / 1 thùng / <1 thùng
(keys: thung_10 / thung_5 / thung_1 / le). Đơn cũ KHÔNG bị đụng (snapshot).

Chạy lại: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apply-catalog.sql`
