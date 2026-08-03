-- ─────────────────────────────────────────────────────────────────────────────
-- Thêm SP mới: SM_01 — SOLVITALE MAGNEFOL 30 viên   (31/07/2026)
--
--   Brand   : SOLVITALE (tạo mới nếu chưa có)
--   Giá vốn : 245.000đ  (cost registry — chỉ owner/admin thấy)
--   Giá bán : 595.000đ cho cả 4 bậc thùng, mặc định "1 thùng"
--   Tồn kho : 0 (chưa nhập hàng)
--
-- Idempotent: chạy lại nhiều lần không tạo bản ghi trùng.
-- Timestamp ghi theo UTC để khớp cách Prisma ghi (cột không có timezone).
-- Chạy: psql "$DATABASE_URL" -f scripts/add-product-SM_01-2026-07-31.sql
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1) Brand SOLVITALE ----------------------------------------------------------
INSERT INTO brands (id, org_id, name, active, created_at, updated_at)
SELECT gen_random_uuid()::text, o.id, 'SOLVITALE', true,
       timezone('utc', now()), timezone('utc', now())
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM brands b WHERE b.org_id = o.id AND b.name = 'SOLVITALE'
);

-- 2) Sản phẩm SM_01 -----------------------------------------------------------
INSERT INTO products (
  id, org_id, sku, name, brand_id, package_size, unit,
  status, sellable, has_sales, allow_oversell,
  cost_price, description, warning_stock, total_stock,
  gallery_urls, marketing_docs, created_at, updated_at
)
SELECT gen_random_uuid()::text, b.org_id, 'SM_01', 'SOLVITALE MAGNEFOL 30 viên',
       b.id, 'Hộp 30 viên', 'Hộp',
       'active', true, true, false,
       245000, 'Tham khảo: https://beeking.com.vn/vien-uong-bo-sung-magie-solvitale-magnefol',
       30, 0,
       '[]'::jsonb, '[]'::jsonb, timezone('utc', now()), timezone('utc', now())
FROM brands b
WHERE b.name = 'SOLVITALE'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.org_id = b.org_id AND p.sku = 'SM_01'
  );

-- 3) 4 bậc giá thùng (khớp convention form "Thêm SP mới" của sale-app) --------
INSERT INTO product_prices (
  id, product_id, tier_name, price, display_order, is_default, active,
  created_at, updated_at
)
SELECT gen_random_uuid()::text, p.id, t.tier_name, 595000,
       t.display_order, t.is_default, true,
       timezone('utc', now()), timezone('utc', now())
FROM products p
CROSS JOIN (VALUES
  ('10 thùng', 1, false),
  ('5 thùng',  2, false),
  ('1 thùng',  3, true),
  ('<1 thùng', 4, false)
) AS t(tier_name, display_order, is_default)
WHERE p.sku = 'SM_01'
  AND NOT EXISTS (
    SELECT 1 FROM product_prices pp
    WHERE pp.product_id = p.id AND pp.tier_name = t.tier_name
  );

COMMIT;

-- Verify ----------------------------------------------------------------------
SELECT p.sku, p.name, b.name AS brand, p.package_size, p.unit,
       p.cost_price, p.total_stock, p.status, p.sellable, p.has_sales
FROM products p LEFT JOIN brands b ON b.id = p.brand_id
WHERE p.sku = 'SM_01';

SELECT pp.tier_name, pp.price, pp.display_order, pp.is_default, pp.active
FROM product_prices pp JOIN products p ON p.id = pp.product_id
WHERE p.sku = 'SM_01'
ORDER BY pp.display_order;
