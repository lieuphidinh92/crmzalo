-- ─────────────────────────────────────────────────────────────────────────────
-- Cập nhật SP GH_001 — GH creation EX+ 270 viên   (31/07/2026)
--
-- SKU này ĐÃ có từ 07/05/2026, đang discontinued + ẩn khỏi catalog. Việc làm:
--   • Giá vốn 460.000 → 480.000đ (theo số anh cung cấp, lệch +4,3%)
--   • Thêm bậc "Giá lẻ niêm yết" = 890.000đ (KHÔNG đụng 3 bậc sỉ 575/580/585k)
--   • Quy cách "Hộp 270 viên" + ảnh chính (hstatic)
--   • Bật bán lại: status active · sellable · has_sales=true (hiện trong catalog)
--
-- Giữ nguyên: tên SP, đơn vị, tồn kho (0), 3 bậc giá sỉ.
-- Idempotent: chạy lại nhiều lần cho cùng kết quả.
-- Chạy: psql "$DATABASE_URL" -f scripts/update-product-GH_001-2026-07-31.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1) Thông tin SP + bật bán lại -----------------------------------------------
UPDATE products SET
  cost_price     = 480000,
  package_size   = 'Hộp 270 viên',
  main_image_url = 'https://product.hstatic.net/200000713511/product/gh-creation-ex-vien-uong-ho-tro-tang-chieu-cao-chinh-hang-nhat_7b1917f11a1a44b79b559105ac46da4a.jpg',
  status         = 'active',
  sellable       = true,
  has_sales      = true,
  updated_at     = timezone('utc', now())
WHERE sku = 'GH_001';

-- 2) Bậc "Giá lẻ niêm yết" 890.000đ -------------------------------------------
--    Có sẵn (kể cả đang tắt) → cập nhật giá + bật lại; chưa có → thêm mới.
UPDATE product_prices pp SET
  price      = 890000,
  active     = true,
  updated_at = timezone('utc', now())
FROM products p
WHERE p.id = pp.product_id
  AND p.sku = 'GH_001'
  AND pp.tier_name = 'Giá lẻ niêm yết';

INSERT INTO product_prices (
  id, product_id, tier_name, price, display_order, is_default, active,
  created_at, updated_at
)
SELECT gen_random_uuid()::text, p.id, 'Giá lẻ niêm yết', 890000, 4, false, true,
       timezone('utc', now()), timezone('utc', now())
FROM products p
WHERE p.sku = 'GH_001'
  AND NOT EXISTS (
    SELECT 1 FROM product_prices pp
    WHERE pp.product_id = p.id AND pp.tier_name = 'Giá lẻ niêm yết'
  );

COMMIT;

-- Verify ----------------------------------------------------------------------
SELECT p.sku, p.name, b.name AS brand, p.package_size, p.unit, p.cost_price,
       p.total_stock, p.status, p.sellable, p.has_sales,
       (p.main_image_url IS NOT NULL) AS co_anh
FROM products p LEFT JOIN brands b ON b.id = p.brand_id
WHERE p.sku = 'GH_001';

SELECT pp.tier_name, pp.price, pp.display_order, pp.is_default, pp.active
FROM product_prices pp JOIN products p ON p.id = pp.product_id
WHERE p.sku = 'GH_001'
ORDER BY pp.display_order;
