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
