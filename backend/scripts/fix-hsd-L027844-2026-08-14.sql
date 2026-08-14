-- ─────────────────────────────────────────────────────────────────────────────
-- Sửa HSD nhập nhầm năm — lô L027844 / phiếu NK-202608-018   (14/08/2026)
--
--   Nhập tay ngày 13/08/2026: HSD gõ thiếu số 2 → lưu '0029-02-01' thay vì
--   '2029-02-01'.
--
--   Hậu quả thật: cron inventory-cron.ts quét đêm thấy expiry_date < today →
--   set status='expired'. Toàn hệ thống (fifo-service.ts:85, inventory-reports,
--   sale-app catalog) chỉ tính lô status='active' → 262 hộp MH_01 còn trong kho
--   bị coi như không tồn tại, products.total_stock tụt về 0, FIFO không cấp
--   được hàng khi bán.
--
--   Việc làm:
--     1) import_order_items.expiry_date  → 2029-02-01
--     2) inventory_batches.expiry_date   → 2029-02-01  + status 'expired'→'active'
--     3) resync products.total_stock + cost_price cho MH_01 từ các lô active
--        (total_stock là cột lưu sẵn — sửa lô mà không resync là vẫn sai)
--
--   KHÔNG đụng: current_quantity (262 đã đúng — 546 nhập − 284 đã bán FIFO),
--   inventory_movements (lịch sử xuất/nhập đúng, không cần bút toán bù),
--   giá vốn 240.000, công nợ NCC.
--
--   Dùng DATE literal thuần trong SQL → không có bẫy múi giờ như new Date() ở JS.
--
-- Backup: scripts/backups/backup-fix-hsd-L027844-2026-08-14.json
-- Idempotent: chạy lại nhiều lần cho cùng kết quả.
-- Chạy: psql "$DATABASE_URL" -f scripts/fix-hsd-L027844-2026-08-14.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Dòng hàng trên phiếu nhập
UPDATE import_order_items
   SET expiry_date = DATE '2029-02-01'
 WHERE id = '1be6e346-4b8d-42e2-98be-fbbbf305d9d7'
   AND batch_code = 'L027844';

-- 2) Lô trong kho: sửa HSD + bật lại active (chỉ khi đang expired vì lỗi này)
UPDATE inventory_batches
   SET expiry_date = DATE '2029-02-01',
       status      = CASE WHEN status = 'expired' THEN 'active' ELSE status END
 WHERE id = '00461bfa-72be-41b4-be14-c8af246d21fb'
   AND batch_code = 'L027844';

-- 3) Resync cột lưu sẵn của MH_01 từ các lô active (mirror syncProductCostAndStock)
UPDATE products p
   SET total_stock = agg.total_stock,
       cost_price  = COALESCE(agg.wavg_cost, p.cost_price),
       has_sales   = CASE WHEN agg.total_stock > 0 THEN true ELSE p.has_sales END
  FROM (
    SELECT b.product_id,
           COALESCE(SUM(b.current_quantity), 0) AS total_stock,
           CASE WHEN SUM(CASE WHEN b.import_cost IS NULL THEN 0 ELSE b.current_quantity END) > 0
                THEN ROUND(
                       SUM(b.import_cost * b.current_quantity)
                       / SUM(CASE WHEN b.import_cost IS NULL THEN 0 ELSE b.current_quantity END), 2)
           END AS wavg_cost
      FROM inventory_batches b
     WHERE b.product_id = 'c56e806a-8484-4f4d-8821-ad04cd84b583'
       AND b.status = 'active'
       AND b.current_quantity > 0
     GROUP BY b.product_id
  ) agg
 WHERE p.id = agg.product_id;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT ii.batch_code, ii.expiry_date AS hsd_phieu
  FROM import_order_items ii WHERE ii.id = '1be6e346-4b8d-42e2-98be-fbbbf305d9d7';

SELECT b.batch_code, b.expiry_date AS hsd_lo, b.status, b.current_quantity
  FROM inventory_batches b WHERE b.id = '00461bfa-72be-41b4-be14-c8af246d21fb';

SELECT p.sku, p.total_stock, p.cost_price,
       (SELECT COALESCE(SUM(current_quantity), 0) FROM inventory_batches
         WHERE product_id = p.id AND status = 'active' AND current_quantity > 0) AS tong_lo_active
  FROM products p WHERE p.sku = 'MH_01';
