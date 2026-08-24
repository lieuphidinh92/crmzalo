-- ─────────────────────────────────────────────────────────────────────────────
-- Cập nhật SP DDR_01 — Vitamin D3 Ddrops 400IU (90 giọt)   (07/08/2026)
--
--   SP đã tồn tại từ 07/05/2026, tồn 16 đv (lô KK-20290101, kiểm kê 14/7).
--   Việc cần làm:
--     1) has_sales = true  → SP có tồn phải hiện trên catalog CRM + sale-app
--     2) package_size = '90 giọt' (đang trống)
--     3) Thêm bậc "Giá lẻ niêm yết" = 510.000đ (display_order 5, không mặc định)
--
--   KHÔNG đụng: cost_price (346.500 — cost registry, chờ anh Philip xác nhận
--   có đổi về 332.000 không), 4 bậc sỉ đang có (352/358/363/370k),
--   3 bậc cũ đã tắt (CTV/ĐL1/ĐL2), ảnh (đã đúng URL).
--
-- Idempotent: chạy lại nhiều lần không tạo bản ghi trùng.
-- Chạy: psql "$DATABASE_URL" -f scripts/update-product-DDR_01-2026-08-07.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1) Hiện lên catalog + bổ sung quy cách -------------------------------------
UPDATE products
SET has_sales    = true,
    package_size = COALESCE(NULLIF(package_size, ''), '90 giọt'),
    updated_at   = timezone('utc', now())
WHERE sku = 'DDR_01'
  AND (has_sales = false OR package_size IS NULL OR package_size = '');

-- 2) Bậc "Giá lẻ niêm yết" 510.000đ ------------------------------------------
INSERT INTO product_prices (
  id, product_id, tier_name, price, display_order, is_default, active,
  created_at, updated_at
)
SELECT gen_random_uuid()::text, p.id, 'Giá lẻ niêm yết', 510000,
       5, false, true,
       timezone('utc', now()), timezone('utc', now())
FROM products p
WHERE p.sku = 'DDR_01'
  AND NOT EXISTS (
    SELECT 1 FROM product_prices pp
    WHERE pp.product_id = p.id AND pp.tier_name = 'Giá lẻ niêm yết'
  );

COMMIT;

-- Verify ----------------------------------------------------------------------
SELECT p.sku, p.name, b.name AS brand, p.package_size, p.unit,
       p.cost_price, p.total_stock, p.status, p.sellable, p.has_sales
FROM products p LEFT JOIN brands b ON b.id = p.brand_id
WHERE p.sku = 'DDR_01';

SELECT pp.tier_name, pp.price, pp.display_order, pp.is_default, pp.active
FROM product_prices pp JOIN products p ON p.id = pp.product_id
WHERE p.sku = 'DDR_01'
ORDER BY pp.active DESC, pp.display_order;
