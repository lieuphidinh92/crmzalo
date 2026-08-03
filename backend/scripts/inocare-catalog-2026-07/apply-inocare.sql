-- ═══════════════════════════════════════════════════════════════════════
-- BẬT BÁN 9 SẢN PHẨM INOCARE (thiết bị chăm sóc răng miệng)
-- ───────────────────────────────────────────────────────────────────────
-- Nguồn giá: Google Sheet "BẢNG GIÁ SỈ" (cột GIÁ BÁN LẺ). Anh Philip chốt:
--   bán sỉ Inocare = GIÁ BÁN LẺ (1 giá chung cho MỌI cấp đại lý).
--
-- Việc script làm cho từng SKU:
--   1) status discontinued → 'active' (đang bị ẩn do chuẩn hoá 1/6/2026)
--   2) tắt (active=false) toàn bộ giá cũ (Đại lý cấp 1/2, CTV — số không khớp)
--   3) gắn 5 mức giá MỚI = giá lẻ: 10/5/1/<1 thùng + Giá lẻ niêm yết
--
-- KHÔNG đụng: giá vốn (giữ theo cost registry hệ thống), tên, quy cách, ảnh.
-- KHÔNG ẩn SP khác (khác với manhae-catalog): chỉ THÊM Inocare vào danh mục bán.
--
-- Giá lẻ theo nhóm:  Ultra X3A = 675.000 · Pro X6 = 805.000 · Bàn chải A8 = 750.000
-- SKU trắng của Ultra trong hệ thống là INC_01TRANG (sheet ghi INC_01T — cùng SP).
--
-- Chạy PROD:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apply-inocare.sql
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;

-- Hàm phụ: gắn 5 mức giá = 1 giá lẻ cho 1 SKU (dùng lại qua CTE bên dưới).

-- ── Ultra Water Flosser X3A — 675.000 (4 màu) ──────────────────────────
-- INC_01XL (xanh lá), INC_01XD (xanh dương), INC_01TRANG (trắng), INC_01H (hồng)
UPDATE products SET status='active', sellable=true, has_sales=true, updated_at=now()
  WHERE sku IN ($$INC_01XL$$,$$INC_01XD$$,$$INC_01TRANG$$,$$INC_01H$$);
UPDATE product_prices SET active=false, updated_at=now()
  WHERE active=true AND product_id IN (SELECT id FROM products WHERE sku IN ($$INC_01XL$$,$$INC_01XD$$,$$INC_01TRANG$$,$$INC_01H$$));
INSERT INTO product_prices (id,product_id,tier_name,price,display_order,is_default,active,created_at,updated_at)
  SELECT gen_random_uuid()::text,p.id,t.tier_name,675000,t.ord,t.is_def,true,now(),now()
  FROM products p,(VALUES ($$10 thùng$$,1,false),($$5 thùng$$,2,false),($$1 thùng$$,3,true),($$<1 thùng$$,4,false),($$Giá lẻ niêm yết$$,5,false)) AS t(tier_name,ord,is_def)
  WHERE p.sku IN ($$INC_01XL$$,$$INC_01XD$$,$$INC_01TRANG$$,$$INC_01H$$);

-- ── Pro Water Flosser X6 — 805.000 (2 màu) ─────────────────────────────
-- INC_02D (đen), INC_02T (trắng)
UPDATE products SET status='active', sellable=true, has_sales=true, updated_at=now()
  WHERE sku IN ($$INC_02D$$,$$INC_02T$$);
UPDATE product_prices SET active=false, updated_at=now()
  WHERE active=true AND product_id IN (SELECT id FROM products WHERE sku IN ($$INC_02D$$,$$INC_02T$$));
INSERT INTO product_prices (id,product_id,tier_name,price,display_order,is_default,active,created_at,updated_at)
  SELECT gen_random_uuid()::text,p.id,t.tier_name,805000,t.ord,t.is_def,true,now(),now()
  FROM products p,(VALUES ($$10 thùng$$,1,false),($$5 thùng$$,2,false),($$1 thùng$$,3,true),($$<1 thùng$$,4,false),($$Giá lẻ niêm yết$$,5,false)) AS t(tier_name,ord,is_def)
  WHERE p.sku IN ($$INC_02D$$,$$INC_02T$$);

-- ── Super Smart Electric Toothbrush A8 — 750.000 (3 màu) ───────────────
-- INC_03T (trắng), INC_03D (đen), INC_03H (hồng)
UPDATE products SET status='active', sellable=true, has_sales=true, updated_at=now()
  WHERE sku IN ($$INC_03T$$,$$INC_03D$$,$$INC_03H$$);
UPDATE product_prices SET active=false, updated_at=now()
  WHERE active=true AND product_id IN (SELECT id FROM products WHERE sku IN ($$INC_03T$$,$$INC_03D$$,$$INC_03H$$));
INSERT INTO product_prices (id,product_id,tier_name,price,display_order,is_default,active,created_at,updated_at)
  SELECT gen_random_uuid()::text,p.id,t.tier_name,750000,t.ord,t.is_def,true,now(),now()
  FROM products p,(VALUES ($$10 thùng$$,1,false),($$5 thùng$$,2,false),($$1 thùng$$,3,true),($$<1 thùng$$,4,false),($$Giá lẻ niêm yết$$,5,false)) AS t(tier_name,ord,is_def)
  WHERE p.sku IN ($$INC_03T$$,$$INC_03D$$,$$INC_03H$$);

COMMIT;

-- ── Kiểm tra sau khi chạy ──────────────────────────────────────────────
-- SELECT p.sku, p.status, pp.tier_name, pp.price::bigint
-- FROM products p JOIN product_prices pp ON pp.product_id=p.id AND pp.active
-- WHERE p.sku LIKE 'INC_0%' ORDER BY p.sku, pp.display_order;
