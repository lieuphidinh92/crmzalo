# FEATURE SPEC — ngheduocsi.vn Sales App

> Per-screen feature requirements derived from [UI_SPEC.md](./UI_SPEC.md)
> and the reference mockup at `/sale-app/public/reference-ui.png`.
>
> Status legend: ✅ shipped (Phase 1) · 🔄 partial · ⏳ not started

---

## 0. Foundational

- ✅ Auth: shared JWT with main CRM via `localStorage['token']` key.
- ✅ Role-aware data: `member` sees only own contacts/orders;
  `owner/admin` see all. Cost fields stripped for non-owner.
- ✅ PWA installable (manifest, SW, 192/512 icons).
- ⏳ Push notifications (Phase 3 — needs Socket.IO auth fix on backend).
- ⏳ Cookie-domain SSO on production (`.ngheduocsi.vn`).

---

## 1. Dashboard / Trang chủ ✅ (rebuild needed per new spec)

### KPI tiles (4)
| Tile | Source endpoint | Format |
|---|---|---|
| Doanh số hôm nay | `/sale-app/home-stats.today.revenue` | `display-xl` VND + trend vs yesterday |
| Doanh số tháng | `/sale-app/home-stats.this_month.revenue` | `display-xl` VND + trend vs last month |
| Số đơn hôm nay | `/sale-app/home-stats.today.order_count` | `display-xl` integer + trend |
| Công nợ hiện tại | NEW `/sale-app/debt-summary` | `display-xl` VND, link to detail |

### Promotion banner
- Carousel of active promotion campaigns (manual content for v1).
- Countdown timer if `endsAt` set (DD : HH : MM : SS).
- Click → promotion detail page (Phase 2).
- Mobile: full-width card just under KPI; Desktop: spans 2 KPI columns.

### Top SP bán chạy
- 5 product cards (rank badge 1–5), source: `/sale-app/top-products?period=this_month`.
- Click product → adds to draft order (Phase 2) or opens product detail.

### Đơn hàng đang xử lý
- 5 most recent NON-COMPLETED orders for this sale: `/sale-app/home-stats.recent_orders` filtered `status != completed`.
- Each row: order_code · store · total · status pill.
- Tap row → order detail.

### Cảnh báo tồn kho
- Top 5 products with stock < `warningStock`. New endpoint `/sale-app/low-stock?limit=5`.
- Each row: thumbnail · name · stock count · "Sắp hết / Thấp / Hết" badge.

### Công cụ bán hàng nhanh (desktop only)
6 quick-action tiles: Tạo đơn hàng · Báo giá nhanh · Kho hàng · Khuyến mãi · Khách hàng · Sản phẩm mới.

### Trust strip (mobile + desktop bottom)
Static 4-pill row: Hàng chính hãng · Giá tốt nhất · Giao hàng nhanh · Hỗ trợ tận tâm.

---

## 2. Sản phẩm ⏳

### List view
- Grid 2-col mobile / 4–5-col desktop. Infinite scroll, page size 20.
- Top filters: brand, danh mục, có khuyến mãi, sắp hết HSD.
- Search bar persists across nav.
- Sort: tên / giá / tồn / mới nhất.

### Product card (per UI_SPEC §Products)
- Image 1:1 cover
- SKU overline
- Name (2-line clamp)
- Wholesale price (royal-700, large)
- Retail suggested price (strike, caption)
- Estimated profit `(retail − wholesale) × 1` displayed as `+x%` chip
- Stock count (colour-coded warn/low/danger)
- Expiry date of earliest active batch
- "+ Thêm vào đơn" outlined CTA → opens cart drawer with this SP added

### Product detail
- Hero image gallery + badges
- Tabs: Thông tin · Giá · Tồn theo lô · Tài liệu MKT · Lịch sử bán cho KH này (if customer context set)
- "Lô gần nhất hết HSD" warning if first batch expires < 90 days
- Owner/admin: see cost + margin; member: hidden

---

## 3. Tạo đơn ✅ (rebuild needed per new spec)

### Flow per UI_SPEC §Create Order
1. Select customer (search by name / phone / mã KH; "+ Tạo KH mới" inline)
2. Tier confirmation (radio: CTV / Cấp 1 / Cấp 2 — default = `customer.policyTier`)
3. Select products (catalog drawer mobile, side panel desktop)
4. Adjust quantity (stepper) + per-item discount
5. Apply promotion (Phase 2: auto-suggest matching active promos)
6. Choose shipping + payment method
7. Review total
8. Confirm → POST `/sale-app/orders` with `status='confirmed'`

### Acceptance
- Validates: must have customer + ≥ 1 product, qty > 0.
- Warns (not blocks) if `qty > stock`.
- Tier change after adding products → user prompted "Apply tier to all items?" (Phase 2; Phase 1: snapshot).
- Submitting state disables CTA + shows spinner; idempotency token to prevent double-submit.
- On success: clear cart, toast "Đã tạo đơn DH-… (1.453.600đ)", offer "Về trang chủ" or "Tạo đơn tiếp".

### Promotion engine (Phase 2)
- Rules table: `mua_X_tang_Y`, `freeship_above_amount`, `% discount per brand`.
- Cart auto-evaluates eligible promos and shows them as toggleable chips.

---

## 4. Đơn hàng ⏳

### List view
- Filter chips: Tất cả · Nháp · Đã xác nhận · Đóng gói · Đang giao · Hoàn tất · Huỷ.
- Date range picker (default: 30 ngày qua).
- Search: order_code / customer name / phone.
- Sort: ngày tạo (desc) default; cho phép theo total / status.
- Member sees own orders only; admin/owner sees all + can filter by sale.

### Row content (per UI_SPEC §Orders)
- `Mã đơn` (mono)
- `Khách hàng` + `cửa hàng` (subtitle)
- `Tổng` (right-aligned, bold royal-700)
- `Status` pill
- `Ngày tạo` (relative, on hover absolute)
- `Sale owner` (avatar + name) — desktop only

### Detail view
- Header: order_code · status timeline (5 stages) · cancel / advance buttons by role.
- Sections:
  - Khách hàng + delivery address
  - Items table (SKU · name · qty · unit price · line total). Admin/owner sees `unit_cost`, `line_cost`, `profit` columns.
  - Gifts (if any)
  - Subtotal · discount · shipping · total · paid · debt
  - Internal note · customer note · cancel reason
- Footer actions: In phiếu giao, Ghi nhận thanh toán, Huỷ đơn.

---

## 5. Tồn kho ⏳

### Summary tab
- 3 KPI: Tổng SP active · SP cảnh báo (`stock < warning`) · Lô sắp hết HSD < 90d.
- Filter: brand, kho, status.

### Per-SKU row
Per UI_SPEC §Inventory:
- Stock available
- Reserved (committed by orders in `packing` not yet shipped)
- Low-stock flag
- Earliest expiring batch date (cell highlighted if < 90d)

### Batch drill-down
Click SKU → table of batches: `batch_code · imported_at · qty (import / current) · expiry · supplier · import_cost (admin only)`.
- "Xuất kho thủ công" action (admin only) for manual write-off.

---

## 6. Tài khoản (Account) ⏳

- Hồ sơ: name, email, role, team, phone.
- Đổi mật khẩu.
- KPI cá nhân (tháng): DS, số đơn, KH mới, retention 90d.
- Mục tiêu tháng (read-only from CRM goals).
- Cài đặt: notification preferences (mobile vibrate, sound).
- Đăng xuất.

---

## 7. Cross-cutting features

### Search global
- Top bar input → search SP / KH / mã đơn in one shot.
- Keyboard: `/` to focus, `Esc` to clear.
- Returns grouped results (Sản phẩm · Khách hàng · Đơn hàng).

### Notification center (top-right bell)
- Sources: new order assigned · debt overdue · low-stock alert · promotion launched.
- Persist last 30 days; mark-all-read action.

### Cart badge (top-right gift box icon)
- Counts items in the in-progress draft order if user navigated away mid-flow.
- Click → returns to /pos with cart intact.

### Offline graceful degradation
- Service worker caches last home stats + last 50 products + last 20 customers.
- Banner "Đang offline — đang dùng dữ liệu lưu trước" if request fails.

---

## 8. Gaps from Phase 1 → new spec

Phase 1 (commit `89c62fb`) shipped Home + POS using a 4-tab orange theme.
Aligning to new spec needs:

| Item | Action |
|---|---|
| Color palette | Swap orange → navy-900 sidebar + royal-700 CTA (see DESIGN_SYSTEM.md §10) |
| Bottom nav | 4 → 5 tabs, lift centre "Tạo đơn" FAB |
| Desktop layout | Add left sidebar 240px navy |
| Top bar | Add global search + cart badge + notification bell |
| Home extras | Promotion banner · Top SP · Cảnh báo tồn kho · Đơn đang xử lý |
| Product card | Add image · retail suggested price · estimated profit · expiry |
| Module: Sản phẩm | NEW page |
| Module: Đơn hàng | NEW page (list + detail) |
| Module: Tồn kho | NEW page |
| Module: Tài khoản | NEW page |
| Promotion engine | NEW backend module |

**Recommended:** Phase 2 starts with shell rebuild (palette + 5-tab + sidebar + top bar). Phase 3 builds Sản phẩm + Đơn hàng modules. Phase 4 adds Tồn kho + Tài khoản + Promotion engine.

---

**Last updated:** 2026-05-30
