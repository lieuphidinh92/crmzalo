# LESSONS_LEARNED.md

Bài học rút ra qua từng session để không lặp lỗi cũ. Đầu mỗi session
mới, đọc file này trước khi code (Rule 3 trong CLAUDE.md).

Format: `[Ngày] - [Vấn đề] - [Cách fix] - [Bài học]`

---

## 08/05/2026 — Filter "Cần chăm 30-60d" hiện KH chỉ 8-29 ngày do anchor lệch

**Vấn đề**:
Section "Cần chăm ngay (30-60 ngày)" trên Báo cáo tổng quan hiện ra
KH có days_inactive 8-29 ngày (Chị Quyên 14d, Mẹ Rofi 10d...) — sai
range. Cùng pattern: Group "Ngủ dài >60d" và "VIP at-risk" của
top-customers cũng sai.

**Root cause**:
- Filter cutoff anchor on `filters.to` (cuối khoảng date pill),
  daysInactive hiển thị anchor on `today`.
- Khi user chọn "Tháng này" (today=08/05, to=31/05 → +1 day=01/06),
  cutoff30 = 02/05, cutoff60 = 02/04. Filter Group A:
  `lastOrder ∈ [02/04, 02/05)` lọt **42 KH**, trong đó **27 KH có
  days_today < 30**.
- 5 KH CEO báo cụ thể đều khớp pattern (lastOrder 24-28/04 → days
  10-14, nhưng cutoff window kéo về 02/04 → vẫn lọt).

Comment cũ ở `getAtRiskCustomers` thừa nhận trade-off "anchored on
filters.to ... shifts cutoff" nhưng không lường được conflict với
daysInactive.

**Cách fix**:
- `getAtRiskCustomers`: cutoff30/60 anchor on `today`, không trên
  `filters.to`. Boundary 30d tròn → Group A (đổi `<` thành `<=` cho
  cutoff30). Boundary 60d tròn → Group A (giữ `>=` cho cutoff60).
  61+ → Group B.
- `getTopCustomers` mode `at_risk`: cùng đổi cutoff anchor today,
  daysInactive cũng anchor today (trước đó cũng dùng `to`).
- Header comment cập nhật: "Cutoffs anchor on today, NOT
  filters.to — at-risk là real-time health check, decoupled từ
  filter pill".
- "Cần chăm" + "Ngủ dài" + "VIP at-risk" giờ KHÔNG đổi khi user click
  filter pill — đúng intent.

**Bài học**:
1. **Filter anchor và display anchor phải cùng reference**. Nếu
   filter dùng cutoff anchor X mà UI hiển thị "X ngày" tính từ Y →
   user thấy mâu thuẫn. Hai anchor phải nhất quán.
2. **`filters.to` thường ở tương lai vs `today`**. "Tháng này" =
   01-31 mà today = ngày 8 → `to` lệch +23 ngày. Ngày kéo về sau
   theo `to` nghĩa là cửa sổ filter dịch +23 ngày so với ngày thực.
3. **Không phải mọi widget cần "shift theo filter pill"**. Date
   pill phù hợp với KPI/Top SP/Top KH/Top NV Sale (ai chốt được bao
   nhiêu tháng X). Nhưng "Cần chăm/Ngủ dài/At-risk" là health check
   real-time — phải decouple. Khi viết widget mới, hỏi rõ semantic
   trước.
4. **Test với boundary case**. KH chính xác 30d / 60d / 61d phải
   được cover trong test plan, không chỉ "nhìn thấy list có 10
   record".
5. **Timezone day-diff bẫy ngầm**: PG lưu `timestamp without time zone`
   như giờ VN local, Prisma đọc về JS Date parse là UTC → lệch 7h.
   Tính `Math.floor((today - last) / 86400000)` cho ra 29 ngày trong
   khi PG `EXTRACT(DAY)` cho 30 → KH boundary 30d/60d bị MISS khỏi
   nhóm A. Fix bằng helper `vnLocalDayIndex(d)` đặt cả 2 endpoint về
   day-index trong VN local rồi diff. Test boundary 30d tròn (Thái
   Oanh) lúc đầu fail rồi pass sau khi áp dụng helper.

---

## 08/05/2026 — DS NV Sale tính sai 92% do nhầm `contact.assignedUserId` với `order.assignedSaleId`

**Vấn đề**:
- Sale "Nguyễn Thành Đạt" hiển thị 1.4tr trên "Top NV Sale tháng",
  ground truth từ DB là 16.265tr (sai 92%).
- Lan rộng: Sale Performance Dashboard CEO, member view KPI/Top SP/
  Top KH cũng cùng sai semantic.

**Root cause**:
Hai khái niệm khác nhau bị code nhầm là một:
- `contact.assigned_user_id` = "ai sở hữu/quản lý contact này"
- `order.assigned_sale_id` = "ai chốt đơn này"

Logic doanh số sale (`calculateResaleRevenue`,
`calculateNewAgentRevenue`, `withSaleScope` ở overview-service) đều
filter qua `contact.assignedUserId` thay vì `order.assignedSaleId`.

Bug bị khuếch đại bởi MISA import script: contact mới import
default-own = Admin, nên 5/6 đơn của Đạt bị tính lệch sang Admin.

**Cách fix (Option B — fix gốc)**:
- `calculateResaleRevenue`, `calculateNewAgentRevenue`: đổi filter
  `contact: { assignedUserId, ... }` → `assignedSaleId, contact: { ... }`
- `withSaleScope`: đổi từ thêm `contact.assignedUserId` → thêm
  `assignedSaleId` ở cấp order
- Inline filters trong `getTopCustomers` (at_risk) và
  `getAtRiskCustomers`: tương tự
- Bonus filter status: thêm `status IN (confirmed, shipped, completed)`
  cho mọi aggregate revenue (loại `draft` chưa chốt + `cancelled`)
- KHÔNG đổi semantic của `calculateActiveRate`, `calculateNewAgents`,
  `calculateRetention90d`, `calculateConversionRate`,
  `calculateAiInsightUsageScore` — những hàm này đếm CONTACTS, semantic
  `contact.assignedUserId` ("đại lý của tôi") là đúng.

**Bài học**:
1. **Hai cột FK lookup khác nhau ≠ đồng nhất.** Khi schema có cả
   `order.assigned_sale_id` lẫn `contact.assigned_user_id`, mỗi cột
   đại diện cho 1 semantic riêng. Trước khi viết logic
   "doanh số/đại lý của sale X", hỏi rõ: tính theo ai chốt đơn hay ai
   sở hữu contact?
2. **Test với data mismatch.** Lỗi này không xuất hiện trên data
   seed (mọi contact tự-assign đúng sale tạo nó). Chỉ lộ ra khi MISA
   import gây mismatch giữa 2 cột. → Test case bắt buộc: tạo đơn
   của sale A cho contact của sale B, verify metric.
3. **Filter status mặc định.** Đơn `draft` chưa chốt và `cancelled`
   đã huỷ KHÔNG được đếm vào doanh số. Mọi aggregate revenue mới
   phải gate `status IN (confirmed, shipped, completed)`.
4. **Audit ground truth trước khi sửa.** Khi user báo "số sai",
   chạy SQL trực tiếp để có "truth" tuyệt đối, rồi reproduce lại
   logic API bằng SQL để xác định chính xác đơn nào bị thiếu/dư.
   Không đoán mò "có thể do X".
5. **Cache không phải scapegoat đầu tiên.** Cache 5min với key chứa
   `from+to+saleId+orgId` → cache miss đúng khi đổi range. Nếu data
   sai khớp với DB query trực tiếp → không phải cache, là logic.
