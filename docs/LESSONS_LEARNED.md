# LESSONS_LEARNED.md

Bài học rút ra qua từng session để không lặp lỗi cũ. Đầu mỗi session
mới, đọc file này trước khi code (Rule 3 trong CLAUDE.md).

Format: `[Ngày] - [Vấn đề] - [Cách fix] - [Bài học]`

---

## 30/05/2026 — Sale Lite Phase 1 build trước khi có UI_SPEC

**Vấn đề**:
Phase 1 sale-app build xong với theme cam (#F97316) + bottom nav
4-tab phẳng, dựa trên 1 spec prompt KiotViet generic. Ngay sau commit
(`89c62fb`), CEO gửi mockup mới + spec UI_SPEC.md chi tiết: navy
sidebar (#0A2540) + royal-blue CTA (#1E40AF) + 5-tab bottom nav với
centre "Tạo đơn" FAB. Nghĩa là phần shell của Phase 1 sẽ phải rebuild
ở Phase 2 trước khi build tiếp Sản phẩm / Đơn hàng / Tồn kho.

**Cách fix**:
- Giữ Phase 1 (backend endpoints + logic POS đã verified working).
- Tạo 3 docs cố định hướng cho session sau:
  - `docs/UI_SPEC.md` (exact text CEO chốt)
  - `docs/DESIGN_SYSTEM.md` (tokens + components + Tailwind mapping)
  - `docs/FEATURE_SPEC.md` (per-screen + Phase 1→spec gap analysis ở §8)
- Memory entry `project_sale_app_direction.md` để load tự động.
- Phase 2 mở đầu = rebuild shell, KHÔNG xoá Phase 1 logic.

**Bài học**:
1. **UI spec phải có TRƯỚC khi code Phase đầu**, nhất là cho app
   greenfield. Em nhảy vào build với 1 mô tả prompt "inspired KiotViet"
   mà không yêu cầu mockup / token cụ thể → 4h work shell phải redo.
   Lần sau: nếu greenfield app + không có mockup → DỪNG hỏi CEO
   "anh có ảnh tham khảo + bảng màu cố định chưa?" trước khi setup
   Vite/Tailwind.
2. **Backend logic và UI shell tách rời nhau là ích lợi**. Phase 1
   backend (5 endpoint sale-app) sống sót qua thay đổi design vì
   không nhúng vào UI. Pattern: ship API trước, UI sau, redesign UI
   không cần đụng API. Áp dụng cho mọi PWA / SPA mới.
3. **Doc không phải overhead — doc là single source of truth**.
   3 file md (UI_SPEC + DESIGN_SYSTEM + FEATURE_SPEC) cho phép
   session khác (kể cả model/agent khác) hiểu hướng mà không cần
   transfer conversation. Memory entry chỉ là index trỏ tới docs;
   nội dung thật trong docs để git-version + diff được.
4. **Claude Code không extract được binary của ảnh CEO đính kèm**
   trong chat. Khi cần asset gốc (mockup, logo), bảo CEO save tay
   vào path cụ thể, đừng giả định em tự lấy được. Workflow:
   `Finder → drag file → đường dẫn tuyệt đối`.

---

## 09/05/2026 — Module Giá Vốn FIFO build xong (Phần A)

**Phạm vi 4 sub-session đã xong**:
- 3.5A: Schema + Backend `/imports` + Seed
- 3.5B: FIFO core (processFIFO, reverseFIFO, transactional Serializable, P2034 catch)
- 3.5C: Frontend `/imports` (List/Form/Detail + ItemPicker + Excel upload + Sidebar menu)
- 3.5D-1: Permission audit (4 endpoints) + cron expire + 2 cảnh báo confirm

**Bài học rút ra**:

1. **OrderItemBatch trace là vô giá khi audit**. 1 OrderItem có thể trừ
   từ NHIỀU lô (FIFO chia line). Không có trace thì không biết line đó
   tính cost theo lô nào → không thể audit margin sai. Schema design
   ban đầu phải có table trace, đừng cố nhồi vào JSON column.

2. **Two related FK columns ≠ một** (lặp lại bài 08/05): `cost_value`
   (per-unit cost) vs `line_cost` (qty × unit_cost). Code dùng nhầm
   → margin 95% (bug đã commit `7f0cd75`). Naming tốt + comment
   rõ ràng ngay tại schema giúp người sau không nhầm.

3. **Permission audit phải scan TOÀN BỘ endpoints, không chỉ
   "endpoint chính"**. 4 endpoint rò cost: inventory/batches,
   inventory/summary, reports/overview/{kpi,top-products,top-customers},
   contacts/list. Mỗi endpoint thêm field cost cần đính kèm strip helper
   ngay từ commit đầu, đừng để "session sau audit".

4. **Polymorphic FK = bỏ FK constraint**. `inventory_movements
   .reference_id` cần trỏ tới orders HOẶC import_orders → Prisma FK
   relation không đủ flexibility. Bỏ relation, giữ string column +
   `referenceType` discriminator, hydrate manual qua từng caller. Có
   chỗ tốn 1 round trip nhưng schema cleaner.

5. **Serializable isolation cho FIFO + catch P2034 là MUST**. Nếu chỉ
   dùng default READ COMMITTED, 2 đơn cùng pack 1 SKU vừa đủ → cả 2
   thấy stock đủ → cả 2 trừ → âm tồn kho. Code path đã có (3.5B), chỉ
   cần test 2-tab thực để xác nhận.

6. **Cron expire phải anchor day-start local TZ**, không phải UTC.
   Schema dùng `timestamp without time zone` → Prisma parse Date có
   giờ-offset. Filter `expiryDate < new Date(...)` ở chỗ today=00:00
   local đảm bảo lô có HSD đúng hôm nay KHÔNG bị flip expired sớm.

7. **Backfill `legacyCost = true` cho đơn cũ TRƯỚC khi merge FIFO
   logic** — nếu không, FIFO sẽ chạm vào 399 đơn MISA và phá data.
   Pattern: schema field mới + backfill SQL + code branch theo flag.

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

---

## 19/05/2026 — Re-import MISA 01-18/5 (loại nháp, áp giá vốn mới)

**Bối cảnh**: anh Philip phát hiện DB lệch MISA → yêu cầu xoá 113 đơn 1-18/5 + import lại 121 đơn sạch từ Sổ chi tiết, với bảng giá vốn mới áp 1/5/2026.

**Bài học rút ra**:

1. **MISA có đơn nháp lệch số liệu — đối chiếu 2 file trước khi tin**.
   File "Bán hàng" gồm CẢ đơn nháp; File "Sổ chi tiết bán hàng" CHỈ có
   đơn thật. Diff `Set(BanHang.MaCT) - Set(SCT.MaCT)` = list nháp.
   Ngày 1-18/5 có 1 đơn nháp duy nhất (XK5832 Nga Lâm 7.065.000đ).
   → Workflow chuẩn: kế toán phải gửi anh BOTH file, hoặc anh tự
   export 2 file và Claude diff để phát hiện nháp.

2. **Cost registry TS file dễ drift với products.cost_price (DB)**.
   Em từng maintain `sku-cost-registry.ts` cho daily imports — sau
   2 tuần đã lệch với DB ở 7/16 SKU (MH_04, MH_07, BIO_01, BIO_02,
   BIO_06, BIO_07, NEU_01, NEU_07). Anh quyết định: dùng `products.
   cost_price` (DB) làm single source of truth, registry TS chỉ là
   convenience helper. Mỗi khi cost đổi → update DB trước, registry
   theo sau (hoặc bỏ registry hẳn).

3. **VAT inconsistency giữa total_amount vs line_total**.
   Đơn XK5858 có VAT 105.556đ: anh chốt `total_amount = 1.425.000`
   (gross) nhưng `line_total = 1.319.444` (net). Khi tính margin
   bằng `SUM(profit)/SUM(line_total)` thì kết quả "đúng" (theo net,
   không tính VAT). Khi cộng `SUM(total_amount)` thì có 105.556đ
   "extra" so với SCT MISA. Cần ghi chú rõ trong report 2 con số
   này khác nhau ở đâu, đừng để CEO confuse.

4. **Khi user nói "biên LN kỳ vọng 30-50%" mà thực tế 11%**.
   Không phải lỗi script — verify SKU/cost/qty đúng theo MISA, rồi
   báo rõ root cause (MH_03 margin 12%, BIO_06/07 lỗ với cost mới)
   để CEO quyết: chấp nhận margin thực, đàm phán cost, hay đổi giá
   bán. Đừng tự "fudge" số để khớp expectation.

5. **Convert Excel → JSON intermediate giúp script TS sạch**.
   Backend chưa có `xlsx` package — thay vì npm install, dùng
   Python openpyxl → JSON ở `/tmp/`, TS script đọc JSON. Vừa
   tránh dependency mới, vừa dễ debug (JSON readable, có thể
   pipe vào jq để verify trước khi --apply).

6. **Idempotent script bằng `existingOrderCodes` set**. Re-import
   script check `prisma.order.findMany({ orderCode: { in: codes }})`
   trước khi create. Re-chạy --apply = no-op. An toàn cho CEO
   re-run khi nghi ngờ.
