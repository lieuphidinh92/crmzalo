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

---

## 15/07/2026 — Tồn kho sale-app lệch kiểm kê: "tồn ma" demo + cột total_stock lưu sẵn

**Vấn đề:** CEO thấy MH_01 (Manhae Menopause 30v) tồn 90 hộp trên sale-app
nhưng file kiểm kê 14/7 không có mã này ("lệch hẳn").

**Root cause (2 tầng):**
1. Đợt kiểm kê 14/7 nạp tồn thật bằng cách THÊM 1 lô mới (created_at tháng 7,
   type=`adjust`/`stocktake`) cho từng SKU thật, nhưng KHÔNG dọn các lô
   demo/test cũ từ tháng 5/2026. → 10 SKU giữ "tồn ma" (tổng 934 đv), gồm cả
   lô `L2605-TEST`. Nhận diện: SKU còn tồn nhưng `count(batches created_at>=2026-07-01)=0`.
2. **`products.total_stock` là cột DENORMALIZED** — sale-app `/sale-app/products`
   trả `stock: p.totalStock` (sale-app-routes.ts:327), KHÔNG tính sống từ lô.
   → Sửa `inventory_batches.current_quantity` là CHƯA đủ; phải resync `total_stock`.

**Cách fix (an toàn, đã verify local):**
- Backup 20 lô ra CSV trước.
- Transaction: insert `inventory_movements` (adjust/stocktake, qty âm, note kiểm toán)
  rồi set `current_quantity=0` cho lô ma (đều `so_lan_ban_ra=0` nên không hỏng đơn).
- Resync `products.total_stock = sum(current_quantity)` cho 10 SKU.
- Verify toàn catalog: `total_stock` khớp 100% tổng lô, 0 mã lệch.
- Backend đọc DB sống → không restart; chỉ hard-refresh PWA.

**Bài học:**
- Mọi thao tác sửa tồn kho phải đụng CẢ HAI: `inventory_batches.current_quantity`
  VÀ `products.total_stock`. Query reconcile sau khi sửa:
  `products having total_stock <> sum(batch.current_quantity)` phải trả 0 dòng.
- Nạp kiểm kê lần sau: phải ZERO/dọn lô cũ trước khi thêm lô đếm mới, tránh cộng dồn tồn ma.
- Fix mới làm ở DB LOCAL. Production (Supabase) nhiều khả năng dính y hệt — chờ CEO duyệt.

---

## 17/07/2026 — Dashboard CRM ra doanh số 0 dù có đơn: sai vocabulary status (`shipped` vs `shipping`)

**Hiện tượng:** Sau khi deploy CRM đầy đủ lên crm.halo.com.vn, Dashboard "Báo cáo tổng quan"
+ Top NV Sale/CEO + xếp hạng/chăm sóc KH đều ra **doanh số 0** cho tháng hiện tại, dù
danh sách Đơn hàng hiện đủ (813 đơn, Đang giao 85, Hoàn tất 700). "Đại lý active" vẫn đúng
(đếm contacts, không đụng orders) → khoanh vùng: chỉ phần gom số từ ORDERS bị lỗi.

**Root cause:** Các module thống kê CRM lọc doanh số bằng `['confirmed','shipped','completed']`.
Nhưng vocabulary status chuẩn (`orders/order-service.ts` → `ORDER_STATUSES`) là
`draft,confirmed,packing,shipping,completed,returned,cancelled`. `shipped`/`paid`/`new` chỉ là
**tên legacy** (LEGACY_STATUS_MAP: shipped→shipping, paid→completed) — DB có **0 đơn** status
`shipped`. Mọi đơn "Đang giao" = `shipping`. Vì tháng 7 phần lớn là đơn Đang giao → bị loại sạch.
Bằng chứng DB local: doanh số list-sai vs list-đúng chênh đúng 143.760.000đ = 3 đơn `shipping`.

**Cách fix:** đổi list ở 5 file CRM sang khớp sale-app (đã đúng sẵn):
`['confirmed','packing','shipping','completed','shipped','paid']`.
Files: `reports/overview-service.ts`, `dashboard/sale-performance-service.ts`,
`contacts/{contact-routes,customer-rank-service,contact-care-routes}.ts` (cả mảng TS lẫn SQL `IN (...)`).
Không đụng DB. cancelled/returned/draft/opening_balance vẫn loại (không phải doanh số thật).

**Bài học:**
- KHÔNG hardcode danh sách status rải rác. Vocabulary chuẩn = `ORDER_STATUSES` trong
  `orders/order-service.ts`; "đếm được doanh số" = trừ `draft,cancelled,returned,opening_balance`.
  sale-app và CRM PHẢI dùng chung 1 list, nếu lệch → số 2 app không khớp.
- Data "trắng" trên dashboard ≠ thiếu data. Kiểm tra thứ tự: danh sách đơn có hiện không?
  Nếu có → lỗi query aggregate (status/ngày), KHÔNG phải thiếu data → KHÔNG kéo/copy DB.
- Suýt copy DB local đè production (production đang có 813 đơn + 1,3 tỷ công nợ thật, sale team
  nhập trực tiếp). May là dừng lại verify trước. Local chỉ là bản dev cũ, KHÔNG phải nguồn thật.

---

## 03/08/2026 — Kiểm kê "đầu ngày" áp thẳng vào production sẽ xoá giao dịch trong ngày

**Vấn đề:** CEO gửi file kiểm thực tế 3/8 (92 SKU, kho tầng 1) để cập nhật tồn. Nếu áp
`tồn = số kiểm` như đợt 14/7 thì sai, vì file kiểm lúc ĐẦU NGÀY còn production vẫn chạy:
lúc 09:46 nhập 20đv SM_01 (phiếu NK-202608-001), 14:08–14:54 đóng gói xuất OL_02 −50đv,
MH_07 −22đv, và 14:51 huỷ 2 đơn cũ → hoàn kho MH_02 +429đv.

**LẦN ĐẦU LÀM SAI — bài học chính:** công thức `tồn = kiểm + Σ movement sau mốc kiểm`
là CHƯA ĐỦ, vì nó gộp 2 loại movement khác bản chất. Áp xong OL_02 ra 155 và MH_07 ra 17
(TRỪ 2 LẦN), phải chạy phiên `KK-202608-003` sửa lại thành 205 và 39.

**Công thức đúng — phân biệt theo CHỨNG TỪ GỐC:**
```
tồn đích = số kiểm + Σ movement sau mốc kiểm CÓ chứng từ gốc cũng tạo sau mốc kiểm
```
- **Chứng từ tạo sau mốc kiểm = hàng thật** → cộng/trừ. Vd `NK-202608-001` tạo 09:46 nhập
  20đv SM_01 → tồn = kiểm + 20.
- **Chứng từ tạo từ trước (tháng 7) = DỌN DỮ LIỆU** → BỎ QUA. 12:00 Đức sửa trạng thái
  loạt đơn sai: 4 đơn cũ (DH-202607-0131/0178/0174/0106, tạo 20–31/7) chuyển `completed`
  → FIFO trừ kho lúc 14h; 2 đơn cũ (DH-202607-0089 shipped 17/7, DH-202607-0156 shipped
  31/7) bị huỷ → hoàn kho +429đv MH_02. Hàng các đơn này đã rời kho từ tháng 7 → lúc kiểm
  08:00 đã không có trong kho → **số kiểm đã đúng, cộng/trừ thêm là tính 2 lần**.
- Cách tra: `inventory_movements.reference_type` + `reference_id` → `orders.created_at` /
  `import_orders.created_at`. So với mốc kiểm. KHÔNG dựa vào `movement.created_at`.
- Cũng loại `referenceType='stocktake'` (movement của chính phiên kiểm) để giữ idempotent.

**Hỏi CEO mốc kiểm CHÍNH XÁC ngay từ đầu:** lần này ban đầu em đoán "đầu ngày" = 00:00;
thực tế Đức kiểm **08:00** và 12:00 mới dọn đơn. Không hỏi thì không thể phân biệt được
đâu là hàng thật đâu là dọn dữ liệu → sai số lớn.

**Ngoại lệ phải hỏi CEO, không tự quyết:** MH_02 kiểm = 0 nhưng hệ thống hoàn kho 429đv.
CEO xác nhận kho trống thật → hàng đã đi rồi mà đơn vẫn bị huỷ → áp 0, còn phải rà lại
2 đơn đó (có thể đang mất doanh thu + công nợ 429 hộp).
Bài học: chênh lệch lớn giữa số kiểm và số hệ thống = câu hỏi nghiệp vụ, KHÔNG phải bug.

**2 bẫy kỹ thuật gặp khi viết script (đã fix, xem `scripts/kiemke-2026-08-03.ts`):**
1. Cột `@db.Date` (`inventory_batches.expiry_date`): ghi `new Date('2028-06-01T00:00:00+07:00')`
   → 2028-05-31T17:00Z → Postgres cắt DATE **lùi 1 ngày, lệch tháng HSD** → lần chạy sau
   không khớp lại lô vừa tạo → P2002 trùng `(org_id, product_id, batch_code)`.
   Đúng: **luôn `T00:00:00Z`** cho mọi giá trị ngày-không-giờ.
2. File backup dùng tên cố định → chạy `--apply` lần 2 ghi đè backup lần 1 (backup mới chỉ
   còn trạng thái ĐÃ sửa) = **mất đường lùi**. Phải gắn timestamp vào tên file backup.

**Kiểm kê theo từng lô:** file ghi NM_1 2 lô (9/2027=17, 12/2027=191) nhưng DB có lô
10/2027 (10đv) không ai kiểm. Không zero lô ngoài danh sách → tồn ra 218 thay vì 208.
Quy tắc: lô không có trong file kiểm → về 0 (khi CEO chốt "file = toàn bộ tồn").

**Kết quả:** `KK-202608-002` (57 lô, −1033đv) + `KK-202608-003` (2 lô, sửa vụ trừ 2 lần).
92 SKU khớp file kiểm, Inocare giữ nguyên 8.601đv (chặn 2 tầng: brand + tiền tố SKU),
tổng tồn **10.982đv** = 2.361 (kiểm) + 20 (nhập NK-202608-001) + 8.601 (Inocare).
Chạy lại = no-op.

**Còn treo:** 7 mã Inocare lệch `total_stock` vs tổng lô 48đv (có SẴN trước khi kiểm, đã
verify bằng backup — sale-app đang hiện cao hơn tồn thật); 4 lô mới thiếu `importCost`
(NM_1 9/2027, BIO_03, BIO_06, BIO_07); phiên `KK-202608-001` do `admin@local.dev` mở
3/8 14:34 còn `counting` 0/139 lô → **để mở là app CHẶN tạo phiên kiểm mới**, nên huỷ.
