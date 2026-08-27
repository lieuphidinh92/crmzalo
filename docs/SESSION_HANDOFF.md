# SESSION_HANDOFF.md — trạng thái hiện tại

**Cập nhật: 15/08/2026.** Cố tình ngắn — chỉ những gì phiên sau cần biết ngay.
Chi tiết lịch sử: `git log`, và memory của Claude Code (tự nạp mỗi phiên).

> Bản handoff Phase 1 (tháng 5, 558 dòng) và bản FIFO đã chuyển vào
> [archive/](archive/). Chúng còn ghi repo ở `~/Desktop` và branch `main` —
> **thông tin đã sai**, đừng đọc để lấy đường dẫn hay branch.

---

## Sự thật hiện tại (đừng tra ở chỗ khác)

| | |
|---|---|
| Repo | `/Users/tranhien1897/dev/zalo-crm/CRM-Med-main` (đã rời khỏi Desktop/iCloud 14/07) |
| Branch làm việc | `feature/sale-app-nhom1` — backend + CRM deploy từ đây |
| Branch sale-app | `main` — chỉ nhận commit sale-app qua cherry-pick |
| DB production | Supabase (session pooler). `DATABASE_URL` trong `backend/.env.prod` (đã gitignore) |
| DB local | `postgres://localhost/zalocrm` |

## Đang chạy trên production

Nhập kho · POS bán hàng · công nợ KH (FIFO + ảnh chứng từ) · công nợ NCC ·
kiểm kê · sửa phiếu nhập đã chốt · dashboard CEO · Zalo messaging.

Tồn kho: **3,14 tỷ**, đối soát `total_stock` vs lô active = **0 mã lệch** (15/08).

## Việc đang treo — cần anh Philip, không phải cần code

1. **Giá nhập RETIN A 30ml** (`USL_49`, 4 đv) — lô đang thiếu giá vốn, bán ra sẽ
   ghi giá vốn 0. Đã ghi chú vào lô. `USL_0333` (quà tặng) để 0 là **cố ý**.
2. **Hoá đơn BTH của phiếu `NK-202608-016`** — 2 lô PBB nhập sai giá (chia 1000,
   đã sửa lô + registry). Tổng phiếu vẫn là 51.068.424đ tính theo giá sai →
   **nghi công nợ NCC thiếu ~8,4 triệu**. Chưa sửa phiếu/công nợ vì cần đối chiếu
   hoá đơn thật.
3. **2 đơn huỷ MH_02** (429 đv, `DH-202607-0089` + `DH-202607-0156`) — hàng đã
   giao nhưng đơn bị huỷ khi dọn trạng thái 3/8. Anh chốt: giữ tồn 0 + treo công
   nợ, anh check với kế toán.

## Việc code còn lại (ưu tiên theo giá trị)

1. Gộp lại **12 cặp lô bị xẻ mã** trước đây về đúng 1 lô mỗi lô hàng thật — để
   kiểm kê khớp mã in trên vỏ thùng.
2. Thêm nút **"Sửa thông tin phiếu"** vào CRM đầy đủ (backend dùng chung, chỉ cần UI).
3. `/api/v1/inventory/alerts` gộp 5 loại cảnh báo + banner dashboard (defer từ 3.5D-2).

## Không có

Test suite · linter · `prisma/migrations/` (schema-first `db push`).
"Xong" định nghĩa thủ công — xem RULE 4 trong [CLAUDE.md](../CLAUDE.md).

## Deploy 25/08/2026 — 5 nhóm thay đổi (ĐÃ push cả 2 nhánh)

`feature/sale-app-nhom1` → 63af24c (backend) + 67ead57 (sale-app) · `main` → c79de2c + b0b5957.

1. **Tra cứu MST** — `GET /api/v1/tax-lookup` (VietQR → dữ liệu Cục Thuế), nút "Tra cứu"
   ở form Yêu cầu xuất VAT, Tuỳ chọn nâng cao (POS) và form tạo KH mới.
2. **Ô Tên đơn vị + Địa chỉ hoá đơn mặc định KHOÁ**, bấm "Sửa" mới gõ được. Tick
   "Lưu thông tin cho lần sau" mặc định BẬT (⚠️ mỗi lần gửi là ghi đè hồ sơ VAT của khách).
3. **Form tạo KH mới** khai luôn hồ sơ hoá đơn; bỏ ô Tỉnh/TP (backend tự tách tỉnh);
   trùng MST → 409.
4. **"Khách của ai người ấy lên đơn"** — chặn ở 3 chỗ (search + POST /orders + PUT
   /customers). Khách chưa ai phụ trách thì ai lên đơn người đó nhận. Admin đổi được
   sale phụ trách ở màn Khách hàng.
5. **Tab "Lịch sử update công nợ"** (`/debt/update-log`) + đưa luôn tab "Chi tiết công nợ"
   (sót từ 16/7, chưa từng lên `main`) lên production.

⚠️ **Việc còn treo:** chưa ai click thử trên production. Cần anh Philip test 3 luồng:
tra MST trên đơn thật · sale thường (member) thử lên đơn cho khách người khác (phải bị
chặn) · tab Lịch sử update công nợ có ra đúng người nhập.

## Deploy 26/08/2026 — dựng lại màn Danh sách đơn hàng

`feature/sale-app-nhom1` → 8ff8a90 · `main` → 84119b6 (chỉ sale-app, backend không đổi).

- Máy tính: **bảng 7 cột** (Mã đơn · Khách hàng · Trạng thái · Ngày tạo · Tổng tiền ·
  Xuất VAT · Thao tác). Điện thoại **giữ kiểu thẻ** — đừng bỏ khối thẻ khi dọn code.
- Chân trang có chọn số dòng/trang; nút **"Bộ lọc"** mở khoảng ngày tự chọn + lọc
  theo nhân viên sale (`?saleId=`).
- Sửa lỗi bố cục: `justify-between` có 3 con làm nút "Quản lý Xuất VAT" nhảy ra giữa.
- TopBar: khối tài khoản 2 dòng. ⚠️ Mockup có dấu ⌄ nhưng CHƯA làm menu — nếu làm
  thì phải là menu thật, đừng để mũi tên mà bấm vào là đăng xuất.

## DB local đang trỏ vào bản sao PRODUCTION (26/08/2026)

`backend/.env` → `zalocrm_prod` (bản sao data thật kéo về 26/8, 47 bảng khớp mã băm).
DB dev cũ `zalocrm` vẫn còn nguyên; đổi lại bằng cách bỏ ghi chú dòng `DATABASE_URL` cũ.
⚠️ Mọi thao tác trên localhost giờ chạy trên dữ liệu thật (bản sao) — đừng nhầm với
production. Kéo lại: pg_dump KHÔNG dùng được (local v16, Supabase v17) → copy từng
bảng bằng `psql \copy` **có liệt kê cột tường minh** (thứ tự cột 2 bên KHÁC nhau,
copy thẳng là lệch cột mà không báo lỗi).

## Notification Service — ĐÃ LIVE (27/08/2026)

Nền thông báo dùng chung + việc đầu tiên: nhắc kế toán xuất VAT **10:00 & 16:00** giờ VN
(gộp cả `requested` + `partial`). Hàng chờ trống thì cron IM, không spam nhóm.

**Đang chạy trên production:** Lark nhóm "Xuất Nhập Kho" + email `tranhien1897@gmail.com`.
3 commit: `bf8737c` (nền + Lark) · `206bd83` (email Brevo + chẩn đoán kênh) · `6df79e1` (gửi thử tin mẫu).

- Code: `backend/src/modules/notifications/` (types · config · service · retry-cron · admin-routes ·
  providers/lark · providers/email · providers/log · templates/vat-pending · format-vn) +
  `modules/orders/vat-digest.ts` + `vat-notify-cron.ts`. Bảng `notification_logs`.
- **Env trên Render (đã đặt):** `LARK_WEBHOOK_ACCOUNTING` · `BREVO_API_KEY` · `EMAIL_FROM`
  (`lieuphidinh92@gmail.com`, đã xác thực trong Brevo) · `NOTIFY_ACCOUNTING_EMAILS` · `SALE_APP_URL`.
- **Tự kiểm bất cứ lúc nào (owner/admin):** `GET /api/v1/notifications/vat-preview` xem kênh nào sẵn
  sàng (không gửi) · `POST /api/v1/notifications/test` gửi thử (hàng chờ trống thì gửi tin MẪU có nhãn
  `[THỬ NGHIỆM]`) · `GET /api/v1/notifications/logs` nhật ký.
- Đã verify từ production 19:54 27/8: cả 2 kênh `sent`, ghi đúng vào `notification_logs`.
- ⚠️ **Brevo đang TẮT ràng buộc IP** (bật lại ở app.brevo.com/security/authorised_ips nếu muốn siết —
  nhớ khai IP outbound của Render, xem tab Connect của service). Nên xoay `BREVO_API_KEY` khi tiện.
- **Phase 3A (27/8):** tab **"Thông báo"** trong Cài đặt CRM — bật/tắt kênh cho từng nhóm + nút Gửi thử +
  nhật ký 20 tin gần nhất. Backend `GET/PUT /api/v1/notifications/settings`. Đã test bằng trình duyệt
  (công tắc khớp DB cả 2 chiều). ⚠️ Frontend CRM có cửa ải `vue-tsc` — push là Vercel build, lỗi TS = FAIL.
- **Phase 3B (27/8):** tin 10:00/16:00 giờ là **1 tin gộp 3 mục** (VAT · công nợ quá hạn KH+NCC · tồn kho),
  gửi nhóm Lark "Xuất Nhập Kho" + email. File mới: `orders/debt-digest.ts` · `inventory/inventory-digest.ts` ·
  `notifications/daily-digest-cron.ts` · `templates/daily-digest.ts` (`vat-notify-cron.ts` đã xoá, thay bằng
  daily-digest-cron). Sự kiện log đổi thành `DAILY_DIGEST` (giữ template `VAT_PENDING` cho dòng log cũ retry được).
  ⚠️ **Đợt này có sửa sale-app** (`views/Inventory.vue`, `composables/useInventory.js` — đọc `?filter=`/`?days=`)
  → phải cherry-pick sang nhánh **`main`**, không chỉ push `feature/sale-app-nhom1`.
- ⏳ **Chưa xảy ra lần nào với dữ liệu THẬT:** 1070 đơn đều `not_issued`, chưa sale nào bấm "Yêu cầu
  xuất VAT". Lần đầu có đơn thật, 10:00 hoặc 16:00 sẽ tự bắn.
