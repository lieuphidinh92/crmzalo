# SESSION HANDOFF — Module Giá Vốn FIFO

> Tạo ngày 08/05/2026. Đọc đầu mỗi session FIFO 3.5x trước khi code.
> Lifecycle: file này được cập nhật cuối mỗi sub-session để ghi tiến độ.

---

## 🆕 Cập nhật 24/06/2026 — Phiếu nhập kiểu POS (form mới)

Dựng lại form nhập hàng theo mẫu KiotViet/Sapo (2 cột + thanh đáy), thêm: chọn **kho**, **phí giao hàng**, **chiết khấu (%/đ)**, **VAT**, **đặt cọc**, hiển thị **công nợ NCC** khi chọn NCC, nút **(+) thêm NCC nhanh**, tìm SP **inline** (bỏ popup ItemPicker — file còn nhưng không dùng), Mã lô/HSD ẩn trong **dòng mở rộng** (giữ FIFO + cảnh báo HSD).

**Mô hình tiền:** `grandTotal (cần TT) = giá trị hàng − chiết khấu + ship + VAT`; `nợ = grandTotal − cọc`. Cọc > 0 → tạo 1 `SupplierPayment` (yêu cầu có NCC). VAT tính trên (hàng − chiết khấu). Tất cả số nguyên VND.

**Schema** `ImportOrder` thêm: `warehouseId, shippingFee, discountType, discountValue, discountAmount, vatRate, vatAmount, grandTotal, depositAmount`. `Warehouse` thêm quan hệ `importOrders`. `db push` xong.

**Backend:** create/update tính `computeCharges`; confirm dùng kho đã chọn + tạo bút toán cọc + `debt=grandTotal−cọc`. **Công nợ NCC đồng bộ**: `syncImportOrderDebt`, danh sách NCC (tổng mua), detail đơn dùng `payableOf` (grandTotal, fallback totalAmount cho đơn cũ). Endpoint mới: `GET /api/v1/warehouses`, `GET /api/v1/supplier-debt/suppliers/:id/balance`.

**Frontend:** dựng lại `ImportFormView.vue` (2 cột, dark theme giữ nguyên); `use-imports.ts` thêm types + `fetchWarehouses/fetchSupplierBalance/createSupplierQuick`.

**Test (script DB + curl thật, đã dọn data):** GĐ1 backend 18/18, GĐ3 tích hợp 16/16 (kho đồng bộ tồn+giá vốn+cảnh báo HSD, công nợ+cọc, sale-app không vỡ, dashboard 200). Frontend `vue-tsc` sạch. **Test click trực quan chờ CEO verify trên `/imports/new`.**

Đơn nhập cũ (grandTotal=0) tự fallback dùng totalAmount → không vỡ.

---

## 🎯 Mục tiêu module

CRM hiện tính `line_cost` per line item dùng `cost_price` snapshot tại thời điểm tạo line. Vấn đề: cùng 1 SKU nhập nhiều lô giá khác nhau (240k, 245k, 250k) — cost trên đơn không phản ánh đúng lô nào thực sự xuất.

Module này:
1. **Nhập hàng** vào kho theo lô (`import_orders` → tạo `inventory_batches`).
2. **Xuất hàng** theo FIFO (lô cũ trừ trước, có thể chia 1 line ra nhiều lô) khi đơn → packing.
3. **Trace audit** mỗi line item dùng từ lô nào (`order_item_batches`).
4. **5 cảnh báo** kho/HSD/giá.

---

## ✅ Đã có sẵn (commit `a3f4aa1` — Session 3 trước, 7/5/2026)

### Schema Prisma đã có
- `InventoryBatch` (inventory_batches): `id, orgId, productId, warehouseId, batchCode, manufactureDate, expiryDate, importQuantity, currentQuantity, importCost, status (active/expired/recalled), notes, createdById, importedAt`. **Unique** `(orgId, productId, batchCode)`. Relations: `OrderItem[]`, `OrderGift[]`, `InventoryMovement[]`.
- `InventoryMovement` (inventory_movements): audit log write-only — `type (import/export/adjust/return), quantity (signed), referenceType, referenceId, note, createdById`.
- `OrderGift`: `batchId?` — gift dạng product trừ kho theo lô.
- `Supplier` (suppliers): đã có model.
- `Warehouse`: đã có (ref qua `InventoryBatch.warehouseId`).

### Backend đã có
- [`backend/src/modules/inventory/batch-routes.ts`](../backend/src/modules/inventory/batch-routes.ts) — full CRUD batch + adjust delta + recall + audit log endpoint.
- [`backend/src/modules/inventory/inventory-reports.ts`](../backend/src/modules/inventory/inventory-reports.ts) — `/inventory/summary` (4 KPI), `/by-brand`, `/low-stock`.
- `syncProductTotalStock` helper: re-aggregate sau mọi mutation.

### Frontend đã có
- [`frontend/src/views/InventoryView.vue`](../frontend/src/views/InventoryView.vue) — 3 tabs (Lô hàng / Audit log / Brand report).
- [`frontend/src/components/inventory/`](../frontend/src/components/inventory/): `BatchFormDialog.vue`, `BatchAdjustDialog.vue`, `BatchAuditLogPanel.vue`.
- [`frontend/src/composables/use-inventory.ts`](../frontend/src/composables/use-inventory.ts).

### Cơ chế trừ kho hiện tại
Code: [`backend/src/modules/orders/order-transitions.ts:97-170`](../backend/src/modules/orders/order-transitions.ts#L97-L170).

Khi order chuyển sang `packing`:
1. Validate **mỗi line item PHẢI có `batchId`** (sale chọn manual). Nếu thiếu → 400 "X sản phẩm chưa chọn lô".
2. Validate `batch.currentQuantity >= need` cho từng lô.
3. Trong `$transaction`: gọi `deductStockForOrder()` → decrement `currentQuantity` + insert `inventory_movements` (type=export, quantity âm).
4. Khi cancel-after-packing: `restoreStockForOrder()` increment ngược.

→ **FIFO mới sẽ override flow này**: bỏ require chọn batch manual, auto-FIFO chia 1 line ra nhiều lô.

---

## ❌ Còn thiếu (phạm vi 4 sub-sessions)

### Schema mới
- `ImportOrder` (import_orders): `id, orgId, importCode (auto NK-YYYYMM-001), supplierId, importDate, nccInvoiceNo, totalAmount, totalQuantity, status (draft/confirmed), notes, attachments (jsonb), createdById, createdAt, confirmedAt, updatedAt`.
- `ImportOrderItem` (import_order_items): `id, importOrderId, productId, batchCode, quantity, unitCost, manufactureDate, expiryDate, lineTotal, notes`.
- `OrderItemBatch` (order_item_batches) — **CORE FIFO TRACE**: `id, orderItemId, batchId, quantityUsed, costAtTime, createdAt`. 1 OrderItem có thể có nhiều record này (chia lô).
- Cập nhật `InventoryBatch`: thêm `importOrderId?` (FK → ImportOrder, nullable cho data legacy), `supplierId?` (FK → Supplier, nullable).
- Cập nhật `Order`: thêm `legacyCost: Boolean @default(false)`. True = đơn cũ trước FIFO (giữ snapshot unit_cost), false = đơn mới có FIFO trace.

### Backend
- `imports-routes.ts`: 8 endpoints (CRUD + confirm + upload-excel + delete-draft).
- `fifo-service.ts`: `processFIFO(orderId, tx)`, `reverseFIFO(orderId, tx)` — phải transactional.
- Hook FIFO vào `order-transitions.ts` packing transition: nếu `legacyCost=false` → gọi `processFIFO` thay vì validate `batchId` manual.
- 5 cảnh báo: tồn thấp / HSD <90d / HSD hết → auto status=expired / cost > giá bán / giá tăng >20%.
- Filter cost fields trong API response theo `request.user.role` (member không thấy `costPrice`, `unitCost`, `lineCost`, `profit`).

### Frontend
- `views/ImportsListView.vue`: list + stats cards + filter.
- `views/ImportFormView.vue`: tạo/sửa đơn nhập với line items + Excel upload + preview validate.
- `views/ImportDetailView.vue`: detail + confirm action.
- `composables/use-imports.ts`.
- `components/imports/ItemPickerDialog.vue`, `ExcelUploadDialog.vue`.
- Sidebar: thêm menu "Nhập hàng" (/imports) trong nhóm "Bán hàng" — visible chỉ owner/admin.
- ProductDetailView: thêm modal "Xem chi tiết các lô" + cost min/max/avg 6 tháng.

### Seed
- 2 đơn nhập Manhae (1 tháng 4, 1 tháng 5) tạo lô L2604-A và L2605-A.
- 1 đơn nhập Bioisland.

---

## 🔑 Quyết định CEO (đã chốt 08/05/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Phân quyền `sale_leader`? | **Bỏ qua sale_leader.** Chỉ 3 cấp `owner / admin / member` (consistent CLAUDE.md). owner+admin: full quyền cost. member: KHÔNG thấy cost ở mọi API. |
| Q2 | Add `Order.legacyCost: Boolean`? | **OK.** Default `false`. Đơn cũ migrate set `true` để skip FIFO. |
| Q3 | Order hiện có cơ chế trừ kho? | **Có** (xem section "Cơ chế trừ kho hiện tại" ở trên). FIFO sẽ thay phần `packing` transition. |
| Q4 | Dừng session, save handoff, mở session mới với 3.5A? | **OK.** File này = handoff. |
| Q5 | FIFO override sale-pick-batch (đơn mới)? | **(a) FIFO làm hết** — xem section bên dưới. |

### Quyết định technical bổ sung (CEO chốt 08/05/2026)
| # | Câu hỏi | Quyết định |
|---|---|---|
| Q5 | FIFO override sale-pick-batch? | **(a) FIFO làm hết.** Bỏ pick batch UI khi sale tạo order line. Sale không cần biết lô — chỉ chọn SP + qty. Khi packing, FIFO tự chọn lô cũ nhất, có thể chia 1 line ra nhiều lô. Implication cho 3.5B: bỏ validate `batchId` ở packing transition cho `legacyCost=false`; bỏ `batchId` field trên OrderItemDialog (frontend); UI ProductPicker chỉ pick SP + qty + đơn giá. Đơn legacy (`legacyCost=true`) vẫn dùng flow batchId-manual cũ để tránh đụng data. |

---

## 📦 Plan 4 sub-sessions

### Session 3.5A — Schema + Backend `/imports` + Seed
**Scope** (~600 LOC):
- Schema: thêm `ImportOrder`, `ImportOrderItem`, `OrderItemBatch`. Cập nhật `InventoryBatch` (+importOrderId, +supplierId nullable). Cập nhật `Order` (+legacyCost). `prisma db push` + `prisma generate`.
- Backfill: tất cả `Order` hiện có set `legacyCost = true` (đơn pre-FIFO).
- Backend `imports-routes.ts`: 7 endpoints (list/detail/create/update/delete-draft/confirm/upload-excel parse).
- `confirm` endpoint: tạo `inventory_batches` từ `import_order_items`, insert `inventory_movements` type=import, sync `product.totalStock`, cập nhật `product.costPrice` = weighted avg active batches.
- Seed: 2 đơn nhập Manhae (NK-202604-001 = 50 hộp MH_01 @240k lô L2604-A, NK-202605-001 = 30 hộp MH_01 @245k lô L2605-A) + 1 đơn Bioisland.
- Test curl: tạo đơn nhập → confirm → verify batches + movements + product.costPrice.

**Deliverable**: backend ready, có data test cho FIFO. Frontend chưa có.

### Session 3.5B — FIFO Logic core (CRITICAL)
**Scope** (~400 LOC, nhưng test rất kỹ):
- `fifo-service.ts`:
  - `processFIFO(orderId, tx)`: cho mỗi `OrderItem`, lấy `inventory_batches` `where { productId, status='active', currentQuantity > 0 }` `ORDER BY importedAt ASC, id ASC`. Validate đủ tồn (sum). Trừ FIFO chia line ra nhiều lô. Insert `OrderItemBatch` records. Update `OrderItem.unitCost` = weighted avg, `lineCost` = totalCost, `profit` = lineTotal - lineCost. Insert `inventory_movements` type=export per batch.
  - `reverseFIFO(orderId, tx)`: đảo ngược — cộng lại `currentQuantity`, insert `inventory_movements` type=return, xoá `OrderItemBatch` records (hoặc giữ lại với reverse flag — chốt sau).
- Hook vào `order-transitions.ts`:
  - Khi packing: nếu `order.legacyCost = false` → gọi `processFIFO(order.id, tx)` thay vì validate `batchId` manual.
  - Khi rollback packing: gọi `reverseFIFO`.
- Test scenarios curl + SQL:
  1. Đơn 1 line, đủ tồn từ 1 lô → trừ đúng 1 lô.
  2. Đơn 1 line, đủ tồn nhưng chia 2 lô (vd cần 60, lô A còn 30 → lô B trừ 30). `OrderItemBatch` 2 records, weighted avg đúng.
  3. Đơn 1 line, KHÔNG đủ tồn → throw + rollback transaction.
  4. Đơn pack rồi cancel → reverseFIFO, batches cộng lại đủ.
  5. Race condition: 2 đơn cùng pack 1 SKU vừa đủ → 1 thành công, 1 fail. (Cần test với 2 connection cùng lúc — Prisma `$transaction` SERIALIZABLE.)
  6. Lô expired không được FIFO trừ.

**Deliverable**: FIFO hoạt động đúng. Đơn cũ legacy vẫn pack với batch manual như cũ.

### Session 3.5C — Frontend `/imports` + ImportsListView/Form/Detail
**Scope** (~1200 LOC):
- `composables/use-imports.ts`.
- `views/ImportsListView.vue`: header + 3 stats cards + filter + table.
- `views/ImportFormView.vue`: section thông tin + section line items (modal pick SP + qty + giá nhập + batch code + HSD) + tóm tắt + lưu nháp / confirm. Excel upload với preview validate.
- `views/ImportDetailView.vue`: read-only nếu confirmed, edit nếu draft.
- Router: thêm 3 routes /imports, /imports/new, /imports/:id.
- Sidebar: thêm menu "Nhập hàng" trong nhóm Bán hàng (filter visible theo role owner/admin).
- ProductDetailView: thêm modal "Xem chi tiết các lô" + cost min/max/avg 6 tháng.

**Deliverable**: end-to-end tạo đơn nhập từ UI.

### Session 3.5D — Cảnh báo + Permission cost + Update Module SP + Roadmap B
**Scope** (~800 LOC):
- 5 cảnh báo:
  1. Tồn thấp: dashboard banner + inventory badge + cron daily.
  2. HSD <90d: badge vàng SP/batch.
  3. HSD hết: cron auto status=expired, FIFO skip.
  4. Cost > giá bán: warning khi confirm import.
  5. Giá nhập tăng >20%: warning khi confirm import.
- Permission audit: scan mọi API trả `costPrice`/`unitCost`/`lineCost`/`profit` — strip cho member.
- ProductDetailView: cost_price subtitle "Giá vốn TB tính từ FIFO".
- Update CLAUDE.md: thêm section "ROADMAP MODULE GIÁ VỐN — PHẦN B (chưa làm)" với checkboxes Rebate NCC + Dashboard NCC + Phân bổ thưởng + Tỷ giá ngoại tệ.
- Update LESSONS_LEARNED.md.

**Deliverable**: Module Giá Vốn FIFO complete (Phần A).

---

## ⚠️ Rủi ro chính

1. **FIFO bug = sai TẤT CẢ báo cáo lợi nhuận**. Phải transactional, race-condition-safe, validate đủ tồn TRƯỚC khi trừ. Test scenario "1 đơn 3 lô" + "cancel rollback" must pass.
2. **Legacy data**: 387 đơn hiện có (theo commit `11882cd` MISA import). Phải backfill `legacyCost=true` để FIFO không đụng.
3. **Permission leak**: nếu quên filter cost fields ở 1 endpoint nào đó → member đọc được cost. Phải scan toàn bộ.
4. **Excel upload**: validate kỹ (SKU exist, qty>0, HSD>importDate). Test edge cases.

## 🚦 Tiến độ sub-sessions

- [x] **3.5A** — Schema + Backend imports + seed
- [x] **3.5B** — FIFO core logic
- [x] **3.5C** — Frontend imports
- [x] **3.5D-1** — Permission audit + cron expire + 2 cảnh báo + Roadmap B
- [x] **3.5D-2** — Alerts endpoint + UI banners + ProductDetail cost stats (commit pending)

🎉 **Module Giá Vốn FIFO Phần A — COMPLETE.**

### 3.5D-2 done (09/05/2026)

**Backend (~250 LOC)**:
- `inventory/alerts-routes.ts` mới — `GET /api/v1/inventory/alerts` gộp 3 loại kho-wide:
  - lowStock (products active stock<=warning), expiringIn90 (HSD <90d), expired (HSD đã qua + qty>0). Response `summary` count + 3 array. Không có cost → mọi role đọc.
- `products/product-routes.ts` — `GET /api/v1/products/:id/cost-stats`:
  - Member: `{ canSee: false }` sentinel.
  - Owner+admin: importCount + min/max + **qty-weighted avg** + recentImports[5]. Window 6 tháng.
- `app.ts` register `inventoryAlertsRoutes`.

**Frontend (~450 LOC)**:
- `composables/use-inventory-alerts.ts`: fetch + computed hasAlerts.
- `components/inventory/InventoryAlertsBanner.vue`: collapse-able banner, 3 chip count, expand → top 5 mỗi loại + "Xem tất cả" link đến /inventory.
- `views/DashboardView.vue` + `views/InventoryView.vue`: embed banner.
- `components/products/ProductBatchesDialog.vue`: modal max-width 900, cost stats card gradient orange (min/avg/max) + table tất cả batches. canSeeCost prop ẩn cột giá vốn.
- `views/ProductDetailView.vue`: button "Xem chi tiết các lô" mở dialog.

**Test 5/5 PASS**:
| # | Endpoint | Result |
|---|---|---|
| 1 | `/inventory/alerts` admin | total=965 (toàn SP active stock=0 — data MISA), 0 expiring/expired |
| 2 | `/inventory/alerts` member | Cùng 965 (không cost-sensitive) |
| 3 | `/products/MH_01/cost-stats` admin | importCount=3, min=240k, **avg=242,778** weighted ((50×240+30×245+10×250)/90), max=250k |
| 4 | `/products/MH_01/cost-stats` member | `{ canSee: false }` ✅ |
| 5 | `/imports/:id/warnings` (3.5D-1 verify sau restart) | warning medium "Giá nhập 999tr cao hơn 408063% so TB" ✅ |

**Backend restart đã thực hiện** — process plain `tsx` cũ đã kill, hiện chạy `tsx watch` mới. Endpoints mới + cron + warnings active.

### 3.5D-2 files
- `backend/src/modules/inventory/alerts-routes.ts` (mới)
- `backend/src/modules/products/product-routes.ts` (edit)
- `backend/src/app.ts` (edit)
- `frontend/src/composables/use-inventory-alerts.ts` (mới)
- `frontend/src/components/inventory/InventoryAlertsBanner.vue` (mới)
- `frontend/src/components/products/ProductBatchesDialog.vue` (mới)
- `frontend/src/views/DashboardView.vue` (edit)
- `frontend/src/views/InventoryView.vue` (edit)
- `frontend/src/views/ProductDetailView.vue` (edit)

### Defer (nếu CEO muốn session sau)
- Race-condition 2-tab thực test (3.5B Serializable + P2034 đã code, chưa stress).
- Roadmap B: Rebate NCC, Dashboard NCC, Phân bổ thưởng, Tỷ giá ngoại tệ.

### 3.5D-1 done (09/05/2026)

**Permission audit (5 endpoints — security fix)**:
- `inventory/batch-routes.ts`: helper `stripBatchCost` strip `importCost` cho member ở list + detail.
- `inventory/inventory-reports.ts`: helper `canSeeCost` strip `stockValue` ở `/summary` + `/by-brand` (set null).
- `reports/overview-routes.ts`: 4 helper `stripKpi` / `stripSparklines` / `stripTopProducts` / `stripTopCustomers` apply post-cache. Strip: `cards.profit.{value,previous,trendPercent,marginPercent,costCoveragePercent}`, `sparklines.profit[]`, products[].`profit/profitMarginPercent`, customers[].`profit`.
- `contacts/contact-routes.ts`: list strip `profitYtd`, `profitMonth` cho member. revenueYtd/Month/Lifetime giữ nguyên (CEO Q1 chốt option a).

**Cron expire batches**:
- `inventory/inventory-cron.ts` mới. `cron.schedule('30 0 * * *', ..., { timezone: 'Asia/Ho_Chi_Minh' })`. Anchor day-start local TZ. Export `sweepExpiredBatches()` để test.
- Register ở `app.ts:startInventoryCronJobs()`.

**2 cảnh báo confirm import**:
- `GET /api/v1/imports/:id/warnings` (owner|admin only): `cost_above_price` (high) + `price_jump >20% vs avg 3 latest` (medium).
- Frontend: `useImports.fetchWarnings(id)` + ImportDetailView render `v-alert` đỏ/vàng theo severity.

**Test 5/5 PASS**:
| # | Test | Result |
|---|---|---|
| 1 | Member /inventory/batches | importCost: null ✅ vs admin 220000 |
| 2 | Member /inventory/summary | stockValue: null ✅ vs admin 354,730,000 |
| 3 | Member /reports/overview/kpi | profit.value: null ✅ vs admin 1,336,180,112 |
| 4 | Member /contacts | profitYtd: null, revenueYtd kept ✅ |
| 5 | sweepExpiredBatches() | OK (0 batches today) |

Test 6 (`/warnings` endpoint): defer test thực — dev backend đang chạy plain `tsx` (không watch) chưa pick up route mới. CEO restart backend sẽ verify trên browser.

### 3.5D-1 files
- `backend/src/modules/inventory/batch-routes.ts` (edit — stripBatchCost)
- `backend/src/modules/inventory/inventory-reports.ts` (edit — stockValue null)
- `backend/src/modules/inventory/inventory-cron.ts` (mới)
- `backend/src/modules/imports/imports-routes.ts` (edit — /warnings endpoint)
- `backend/src/modules/reports/overview-routes.ts` (edit — 4 strip helpers)
- `backend/src/modules/contacts/contact-routes.ts` (edit — strip profit)
- `backend/src/app.ts` (edit — register cron + multipart đã có sẵn)
- `frontend/src/composables/use-imports.ts` (edit — fetchWarnings)
- `frontend/src/views/ImportDetailView.vue` (edit — render warnings alerts)
- `CLAUDE.md` (edit — Roadmap section)
- `docs/LESSONS_LEARNED.md` (edit — 7 bài học)

### Lưu ý cho 3.5D-2 (next, last)
- Foundation đã đặt: cron expire daily, warnings endpoint, permission strip cost ở 4 endpoints.
- 3.5D-2 UI: alerts endpoint gộp 5 loại + dashboard banner + inventory badge SP-level + ProductDetail "Xem các lô" + cost stats min/max/avg 6 tháng.
- Verify race-condition 2-tab thực sẽ làm cùng 3.5D-2.

### 3.5C done (09/05/2026)
- `composables/use-imports.ts` (mới ~280 LOC): types ImportOrder/ImportLine/ImportSupplier/ParsedExcelRow/Filters; helpers `formatVNDFull`, `formatVNDCompact`, `formatDateVN`, `suggestBatchCode`; API wrappers fetchImports/fetchImport/createImport/updateImport/deleteImport/confirmImport/parseExcel + fetchSuppliers (cached); computed `stats` derive client-side từ list (monthAmount confirmed-this-month, draftCount, totalCount, topSupplier YTD). Stats card thứ 3 dùng draftCount theo CEO chốt (option b).
- `views/ImportsListView.vue` (mới ~400 LOC): header + 3 stats cards + filter (search/supplier/status/from/to) + v-data-table-server với cột ImportCode/Date/Supplier/Invoice/Qty/Amount/Status/Actions. Click row draft → /edit, confirmed → /detail. Permission `adminOnly`.
- `views/ImportFormView.vue` (mới ~500 LOC): create + edit (path /imports/new và /imports/:id/edit). 3 sections (info / line items / summary). 2 actions: "Lưu nháp" (POST/PUT) + "Xác nhận nhập kho" (lưu rồi confirm). "Xoá nháp" delete-only-draft. Edit mode loads existing draft; redirect /imports/:id nếu confirmed (read-only). Toast feedback. Tích hợp ItemPicker + ExcelUpload dialog.
- `views/ImportDetailView.vue` (mới ~250 LOC): header + 4 info cells + lines table + linked batches table (visible chỉ khi confirmed) + summary card. Action "Sửa" và "Xác nhận nhập kho" chỉ hiện cho draft. Re-fetch sau confirm.
- `components/imports/ItemPickerDialog.vue` (mới ~250 LOC): autocomplete SKU/tên (call `/products?search=`), inputs qty/cost/batchCode/dates/notes, validate client-side (qty>0, cost>0, expiry>mfg), live total preview, auto-suggest batchCode `L{YYMM}-A`, prefill costPrice từ product nếu có. Edit mode load existing line.
- `components/imports/ExcelUploadDialog.vue` (mới ~250 LOC): drag/drop file picker, parse qua `/imports/parse-excel`, preview table với row-error highlight đỏ, button "Đưa X dòng vào form" chỉ enable khi có row hợp lệ. Bỏ qua row có lỗi tự động.
- `router/index.ts` (edit): +4 routes `/imports`, `/imports/new`, `/imports/:id/edit`, `/imports/:id` đều `meta.adminOnly`.
- `layouts/DefaultLayout.vue` (edit): +menu "Nhập hàng" trong nhóm BÁN HÀNG, trước "Quản lý kho", `adminOnly: true`.
- `views/ProductDetailView.vue` (edit nhỏ): cost_price field thêm `hint="Giá vốn TB tính từ FIFO — tự cập nhật khi tạo đơn nhập"`.
- `app.ts` (edit): register `@fastify/multipart` (đã có trong package, chỉ thiếu register) với limits 5MB / 1 file.

### 3.5C verify
- TypeScript: `npx vue-tsc --noEmit` cho frontend imports module → sạch.
- Backend curl: list (4 đơn), suppliers (6), products search (3 matches), `parse-excel` multipart fixture (3 rows + 2 lỗi đúng: SKU không tồn tại, qty=0).
- Test browser end-to-end (List → Create form → ItemPicker → Excel upload merge → Save draft → Detail → Confirm) defer cho CEO verify trên `/imports`.

### 3.5C files
- `frontend/src/composables/use-imports.ts` (mới)
- `frontend/src/views/ImportsListView.vue` (mới)
- `frontend/src/views/ImportFormView.vue` (mới)
- `frontend/src/views/ImportDetailView.vue` (mới)
- `frontend/src/components/imports/ItemPickerDialog.vue` (mới)
- `frontend/src/components/imports/ExcelUploadDialog.vue` (mới)
- `frontend/src/router/index.ts` (edit)
- `frontend/src/layouts/DefaultLayout.vue` (edit)
- `frontend/src/views/ProductDetailView.vue` (edit nhỏ)
- `backend/src/app.ts` (edit — register fastify-multipart)

### Defer sang 3.5D (đã note ở plan handoff)
- ProductDetail "Xem chi tiết các lô" + cost min/max/avg 6 tháng — cần endpoint stats riêng.
- 5 cảnh báo + permission audit + cron HSD-expired + Roadmap B.
- Race-condition 2-tab test thực (Serializable + P2034).

### 3.5B done (08/05/2026)
- `fifo-service.ts` mới — exports `validateFifoStock`, `processFIFO`, `reverseFIFO`. Tất cả nhận `tx` (Prisma transaction client) — caller chịu trách nhiệm wrap transaction.
- `processFIFO`: per item, lấy active batches sort `importedAt ASC, id ASC`, trừ FIFO chia line ra nhiều lô, insert OrderItemBatch trace + InventoryMovement type=export per lô. Update OrderItem `unitCost` = weighted avg, `lineCost` = totalCost, `profit` = lineTotal - lineCost. Re-check tồn ngay trước khi mutate (defeats race vs validateFifoStock).
- `reverseFIFO`: đọc OrderItemBatch records, increment lại stock, insert movements type=return, xoá trace, reset OrderItem cost = null.
- Hook ở `order-transitions.ts`:
  - Packing: nếu `legacyCost=true` → flow cũ (validate batchId + deductStockForOrder). Nếu `false` → validate gifts batchId riêng + `validateFifoStock` (trả 400 sạch nếu thiếu) → trong transaction Serializable: `processFIFO` items + `deductGiftsOnly` gifts.
  - Cancel sau pack: nếu `legacyCost=true` → restoreStockForOrder. Nếu `false` → `reverseFIFO` items + `restoreGiftsOnly` gifts.
  - Catch P2034 (Postgres serialization conflict) → 409 "Đơn vừa được đóng gói bởi giao dịch khác".
  - Catch FIFO race error "Tồn kho thay đổi giữa lúc xác nhận" → 409.
- Tách 2 helper mới: `deductGiftsOnly` + `restoreGiftsOnly` — chỉ xử lý gifts với batchId manual. Items đi qua processFIFO/reverseFIFO; `deductStockForOrder`/`restoreStockForOrder` cũ giữ nguyên cho legacy path.

### 3.5B test results (5/5 scenarios PASS)
| # | Scenario | Verify |
|---|---|---|
| 1 | qty=20 → 1 lô L2604-A | Stock 50→30, OrderItemBatch 1 record, unitCost=240k, lineCost=4.8M, profit=1.2M |
| 2 | qty=60 → 2 lô | L2604-A 30→0 + L2605-A 30→0, 2 records, unitCost=242,500 weighted, lineCost=14.55M, profit=3.45M |
| 3 | qty=200 → insufficient | 400 "Không đủ tồn kho FIFO cho MH_01... cần 200, còn 10". Stock không bị đụng |
| 4 | Cancel ORDER2 | Stock cộng lại đủ (0→30, 0→30), trace=0 records, cost reset NULL, movements 2 export + 2 return |
| 5 | L2604-A status=expired + qty=25 | Skip L2604-A, chỉ trừ L2605-A 25, lineCost=6.125M (25×245k) |

Race condition (test 6): defer test thực — Serializable + P2034 catch đã code. Sẽ verify trong session 3.5C/3.5D với 2 browser tabs.

### 3.5B files
- `backend/src/modules/orders/fifo-service.ts` (mới, ~250 LOC)
- `backend/src/modules/orders/order-transitions.ts` (edit — hook FIFO + tách 2 gift helpers)

### 3.5A done (08/05/2026)
- Schema: `ImportOrder`, `ImportOrderItem`, `OrderItemBatch` thêm mới. `InventoryBatch` thêm `importOrderId?`, `supplierId?`. `Order` thêm `legacyCost: Boolean @default(false)`. Bỏ FK `InventoryMovement.referenceId → orders.id` (giờ polymorphic — orders / import_orders / manual_adjust). `db push` xong, không cần migration files (project dùng `db push`).
- Backfill: `UPDATE orders SET legacy_cost = true` cho 399 đơn pre-FIFO. Khi FIFO 3.5B hook vào packing transition: chỉ run cho `legacyCost=false` (đơn mới).
- API `/api/v1/imports`: 7 endpoints — list/detail/create/update/delete-draft/confirm/parse-excel. Phân quyền `requireRole('owner', 'admin')` ở mọi endpoint.
- `confirm` logic: idempotent qua status check inside transaction (CONCURRENT_CONFIRM throw → 409). Tạo `inventory_batches` + `inventory_movements` type=import, sau đó sync `product.totalStock` + `product.costPrice` (weighted avg) ngoài transaction.
- Seed: 3 đơn confirmed — NK-202604-001 (50 hộp MH_01 @240k lô L2604-A), NK-202605-001 (30 hộp MH_01 @245k lô L2605-A), NK-202605-002 (20 hộp BIO_01 @350k lô L2605-B). Sau seed: MH_01 totalStock=80, costPrice=241,875 = (50×240+30×245)/80 ✅. Idempotent qua `importCode` check + batch-collision check.
- Test 8 case PASS: list, member 403, create draft, update items, confirm, batch+product+movement đúng, double-confirm 400, delete confirmed 400.
- Excel parse endpoint dùng `exceljs` (đã có sẵn trong package.json). Test multipart upload defer cho 3.5C khi có frontend dialog.

### 3.5A files
- `backend/prisma/schema.prisma` (edit)
- `backend/src/modules/imports/imports-routes.ts` (mới, ~640 LOC)
- `backend/src/modules/imports/imports-seed.ts` (mới, ~225 LOC)
- `backend/src/app.ts` (edit, +2 lines)
- `backend/src/modules/inventory/batch-routes.ts` (edit — bỏ `order` relation, replace bằng manual lookup polymorphic)

### Lưu ý cho 3.5B
- Default warehouse helper đã có ở `imports-routes.ts:getDefaultWarehouseId(orgId)`. Có thể tách ra shared helper khi 3.5B cần.
- `InventoryMovement.order` relation đã bị xoá → mọi code dùng `movement.order` phải làm manual lookup giống `batch-routes.ts` đã làm. (Hiện chỉ 1 caller là batch-routes — đã fix.)
- FIFO 3.5B sẽ dùng `referenceType='order'` cho movements type=export khi đơn pack — consistent với cũ.

Mỗi session xong cập nhật check ☑ ở đây + commit message tương ứng.
