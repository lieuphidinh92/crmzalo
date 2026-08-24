-- ─────────────────────────────────────────────────────────────────────────────
-- Bật bán lại + cập nhật 2 SP USOLAB Tone Up Whitening   (11/08/2026)
--
--   Cả 2 mã ĐÃ tồn tại sẵn trong DB (brand Useful), đang ẩn khỏi catalog
--   (has_sales = false, status = 'discontinued'), tồn kho 0.
--
--   USL_032 — USOLAB BIO TONE UP WHITENING FACE MASK   (quy cách 50ml)
--     cost 222.750 → 234.000   |  giá lẻ niêm yết 412.000
--   USL_32  — USOLAB BIO TONE UP WHITENING BODY MASK   (quy cách 20g x 5 gói)
--     cost 272.250 → 301.500   |  giá lẻ niêm yết 670.000
--
--   Tên KHÔNG kèm quy cách (anh Philip chốt 11/08/2026) — quy cách nằm ở
--   cột package_size riêng, không lặp lại trong tên.
--
--   Việc làm:
--     1) has_sales = true + status = 'active'  → hiện trên catalog CRM + sale-app
--        (status cũng phải đổi: 'discontinued' bị loại khỏi báo cáo tồn kho
--         inventory-reports.ts:105,148 và cảnh báo tồn thấp alerts-routes.ts:63)
--     2) Tên đầy đủ + package_size + ảnh chính (2 URL đã verify HTTP 200)
--     3) cost_price theo số anh Philip gửi 11/08/2026 (anh đã duyệt ghi đè)
--     4) Thêm bậc "Giá lẻ niêm yết" (display_order 5, KHÔNG mặc định)
--
--   KHÔNG đụng: 3 bậc sỉ đang có (CTV / Đại lý cấp 1 / Đại lý cấp 2 (VIP)),
--   brand, unit, warning_stock, total_stock.
--
--   ⚠️ USL_032 và USL_32 là HAI mã khác nhau (mặt nạ mặt vs kem ủ body) —
--      trong DB còn USL_0032 (face mask 250ml) và USL_00032 (5ml) không liên quan.
--
-- Idempotent: chạy lại nhiều lần không tạo bản ghi trùng.
-- Chạy: psql "$DATABASE_URL" -f scripts/update-product-USL_032-USL_32-2026-08-11.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1) USL_032 — Face mask 50ml -------------------------------------------------
UPDATE products
SET name           = 'USOLAB BIO TONE UP WHITENING FACE MASK',
    package_size   = '50ml',
    cost_price     = 234000,
    status         = 'active',
    has_sales      = true,
    sellable       = true,
    main_image_url = 'https://sieuthilamdep.com/images/detailed/22/mat-na-u-kich-trang-da-usolab-bio-tone-up-whitening-face-mask.jpg',
    updated_at     = timezone('utc', now())
WHERE sku = 'USL_032';

-- 2) USL_32 — Body mask 20g x 5 gói -------------------------------------------
UPDATE products
SET name           = 'USOLAB BIO TONE UP WHITENING BODY MASK',
    package_size   = '20g x 5 gói',
    cost_price     = 301500,
    status         = 'active',
    has_sales      = true,
    sellable       = true,
    main_image_url = 'https://edbeauty.vn/wp-content/uploads/2026/06/Kem-u-duong-trang-sang-da-Usolab-Bio-Tone-Up-Whitening-Body-Mask-2.jpg',
    updated_at     = timezone('utc', now())
WHERE sku = 'USL_32';

-- 3) Bậc "Giá lẻ niêm yết" ----------------------------------------------------
INSERT INTO product_prices (
  id, product_id, tier_name, price, display_order, is_default, active,
  created_at, updated_at
)
SELECT gen_random_uuid()::text, p.id, 'Giá lẻ niêm yết', t.price,
       5, false, true,
       timezone('utc', now()), timezone('utc', now())
FROM products p
JOIN (VALUES
  ('USL_032', 412000),
  ('USL_32',  670000)
) AS t(sku, price) ON t.sku = p.sku
WHERE NOT EXISTS (
  SELECT 1 FROM product_prices pp
  WHERE pp.product_id = p.id AND pp.tier_name = 'Giá lẻ niêm yết'
);

COMMIT;

-- Verify ----------------------------------------------------------------------
SELECT p.sku, p.name, b.name AS brand, p.package_size, p.unit,
       p.cost_price, p.total_stock, p.status, p.sellable, p.has_sales,
       left(p.main_image_url, 45) AS image
FROM products p LEFT JOIN brands b ON b.id = p.brand_id
WHERE p.sku IN ('USL_032', 'USL_32')
ORDER BY p.sku;

SELECT p.sku, pp.tier_name, pp.price, pp.display_order, pp.is_default, pp.active
FROM product_prices pp JOIN products p ON p.id = pp.product_id
WHERE p.sku IN ('USL_032', 'USL_32')
ORDER BY p.sku, pp.active DESC, pp.display_order;
