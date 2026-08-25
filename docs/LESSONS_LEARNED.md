# LESSONS_LEARNED.md — luật đang hiệu lực

Đọc file này trước khi code (RULE 3). **Cố tình ngắn**: mỗi bài học 1–3 dòng,
đủ để không lặp lỗi. Cần diễn giải đầy đủ (bối cảnh, số liệu, cách fix từng
bước) thì mở đúng mục trong
[archive/LESSONS_2026-05_2026-08.md](archive/LESSONS_2026-05_2026-08.md).

> **Vì sao gọn:** bản cũ phình 63 → 661 dòng (~14.000 token) và bị nạp lại mỗi
> phiên → phiên nào cũng chậm dần. Gọn hoá 15/08/2026. **Thêm bài học mới thì
> viết 1–3 dòng vào đây + diễn giải dài vào archive**, đừng để file này phình lại.

---

## 🔢 Tiền & giá vốn

- **Tiền LUÔN là số nguyên đồng.** Ô nhập `type="number"` + `v-model.number` coi
  dấu chấm là dấu thập phân → gõ `94.250` kiểu VN ra **94,25đ** (chia 1000). Đã
  làm sai công nợ NCC + giá vốn registry + lãi gộp (phiếu NK-202608-016, 11/08).
  Backend `validateItem` giờ chặn; đừng bỏ chặn đó.
- **Giá vốn `1,00đ` tròn = HÀNG TẶNG cố ý**, không phải lỗi — backend chặn
  `unitCost > 0` nên người nhập không ghi được 0. Đừng "sửa" thành giá đầy đủ:
  lãi gộp 100% của hàng tặng là đúng. Chia-1000 thì số lẻ khớp giá thật ÷ 1000.
- **Nguồn giá vốn chuẩn = cost registry `products.cost_price` trong CRM**, KHÔNG
  tin Excel MISA; lệch >5% thì cảnh báo, đừng tự ghi đè.
- **Lô thiếu `import_cost` là mìn:** `fifo-service.ts` coi null là **0** → bán ra
  ghi giá vốn 0 → lãi gộp thổi phồng bằng cả doanh thu. Truy quét định kỳ:
  `import_cost IS NULL` · `import_cost <> round(import_cost)` ·
  `import_cost < 10% giá bán thấp nhất`.
- **Doanh thu tính lãi gộp dùng số CÓ VAT** (registry đã gồm VAT đầu vào).

## 📦 Tồn kho

- **`products.total_stock` là cột LƯU SẴN** — sale-app đọc nó, không tính sống từ
  lô. Mọi thao tác đụng lô **phải resync**. Đối soát bắt buộc trả **0 dòng**:
  `total_stock <> SUM(lô active)`.
- Chỉ lô **`status='active'`** được tính vào tồn và được FIFO cấp hàng. Lô
  `expired`/`recalled` là hàng **vô hình** với toàn hệ thống.
- **Kiểm kê "đầu ngày" phải cộng/trừ giao dịch trong ngày**, áp thẳng số kiểm sẽ
  xoá phiếu nhập vừa nhập + cộng lại hàng đã bán. Lệch lớn → hỏi anh Philip.
- **Nạp kiểm kê phải zero/dọn lô cũ trước** khi thêm lô đếm mới, tránh cộng dồn.
- **Trùng mã lô + CÙNG HSD → gộp vào lô đang có** (giá vốn = TB gia quyền theo
  tồn còn lại). HSD khác → chặn, đó là 2 lô khác nhau thật. Chặn cứng như trước
  làm thủ kho bịa mã (`L027844A`, `1440326AB`) → 1 lô hàng thật bị xẻ nhiều mã.
- **"Vừa kiểm kê xong lại lệch" → nghi CODE trước, đừng nghi người kiểm.**

## 🕐 Ngày tháng (đọc kèm mục LUẬT MÚI GIỜ trong CLAUDE.md)

- Cột `@db.Date` phải ghi `new Date('YYYY-MM-DDT00:00:00Z')` — **có `Z`**. Gắn
  `+07:00` thành 17:00Z hôm trước → Postgres cắt DATE **lùi 1 ngày**.
- **Validate khoảng năm 2000–2100 ở backend.** Browser cho gõ năm 2 chữ số:
  HSD `0029` (đúng ra 2029) làm cron đánh lô `expired` ngay đêm nhập → **262 hộp
  MH_01 biến mất khỏi kho**, sale báo hết hàng dù kho còn hàng (13–14/08).
- Ngày mặc định đừng dùng `new Date()` trơ cho cột `@db.Date`: tạo lúc 1–7h sáng
  VN sẽ ghi **lùi 1 ngày** (có thể lùi sang tháng trước). Dùng `vnTodayDateOnly()`.
- Lọc khoảng ngày: BE `new Date(from+'T00:00:00')` và `new Date(to+'T23:59:59')`;
  FE tự format từ `getFullYear/getMonth/getDate`, **đừng `toISOString()`**.
- Anchor "N ngày qua" phải tính từ **00:00 hôm nay giờ VN**, không phải "lúc này".

## 🔐 Quyền

- **Tách "quyền xem phạm vi" khỏi "quyền xem tiền".** Đừng nâng ai lên `admin`
  chỉ để cho xem thêm đơn — admin kéo theo giá vốn/lãi gộp. Dùng cờ
  `users.can_view_all_orders`.
- Cờ nằm trong JWT → **đổi cờ trong DB thì user phải đăng xuất/đăng nhập lại**.
  Luôn dặn anh Philip việc này.
- Phiếu nhập đã chốt: `PATCH /imports/:id` chỉ mở field **không tham gia số học**
  (mã lô, NSX, HSD, số HĐ, ghi chú, ngày nhập). Số lượng/giá vốn bất biến.

## 🏷️ Dữ liệu & vocabulary

- Status đơn là **`shipping` / `completed`**, KHÔNG phải `shipped`/`paid`. Nguồn
  chuẩn: `ORDER_STATUSES` trong `order-service.ts`. Hardcode sai từng làm
  dashboard ra **doanh số 0** dù có đơn (17/07). Dashboard trắng ≠ thiếu data.
- Hiển thị catalog do **`hasSales`** quyết định, KHÔNG phải `status`. Có tồn thì
  auto hiện. Nhưng `status='discontinued'` vẫn bị loại khỏi báo cáo tồn + cảnh
  báo tồn thấp → bật bán lại phải sửa **cả hai**.
- Đừng nhầm `contact.assignedUserId` (ai chăm KH) với `order.assignedSaleId` (ai
  chốt đơn) — từng làm DS nhân viên sai 92%.
- Tạo user mới **phải check trùng TÊN**, không chỉ email — trùng tên chia đôi
  doanh số.

## 🧪 Verify (đây là chỗ hay ăn đòn nhất)

- **`tsc --noEmit` sạch KHÔNG phải bằng chứng.** Repo chưa `prisma generate` nên
  type Prisma suy biến thành `any` — sai kiểu ở tầng query lọt hết. `batchId:
  { not: null }` (cột bắt buộc) từng làm **GET /imports/:id trả 500 với MỌI
  phiếu** mà tsc báo 0 lỗi.
- Test endpoint phải **assert `status === 200`** trước khi assert nội dung.
  `data?.x || []` biến lỗi 500 thành mảng rỗng im lặng.
- Luôn có 1 ca **"đường đi bình thường vẫn chạy"**, không chỉ ca tính năng mới.
- **"Push xong" ≠ "đã deploy".** Verify TỪNG dịch vụ bằng cách tải artefact
  production về: route mới trả 401 (route ảo trả 404 để đối chứng) · bundle FE
  grep chuỗi mới. Vercel `crm-halo` đã từng **bỏ sót 1 push** 13 phút.
  ⚠️ Vercel trả **200 + index.html** cho file `/assets/` không tồn tại (SPA
  rewrite) → grep nội dung, đừng tin mã 200.
- Khi test fail, **đọc log backend**: `PrismaClientValidationError` hiện rõ ở đó
  dù HTTP chỉ trả 500 chung chung.

## 🎨 UI

- **Đừng đặt class trùng utility Tailwind cho thẻ HTML:** `class="grid"` biến
  `<table>` thành CSS grid → `colspan`/`colgroup` vô nghĩa. Check
  `getComputedStyle().display === 'table'`.
- Nhãn theo `type` dùng **MAP, không ternary** — ternary 2 nhánh làm loại thứ 3
  hiện sai nhãn.
- Chứng từ A4: chữ ký bị cắt do height cứng + `overflow:hidden` + flex shrink →
  `flex:none`, nén vừa 297mm, verify bằng đo DOM.
- PWA `autoUpdate`: sau deploy phải dặn anh **hard-refresh 1 lần**.

## ⚙️ Quy trình

- **1 việc / 1 phiên.** Phiên dài làm mọi lượt sau chậm dần vì phải nạp lại toàn
  bộ hội thoại. Xong 1 việc → `/clear`.
- `main` và `feature/sale-app-nhom1` **đã DIVERGED**: backend + CRM → `feature`;
  sale-app → phải tới `main` (cherry-pick).
- Script sửa dữ liệu production: **dry-run trước · backup ra `scripts/backups/`
  · idempotent · verify sau khi ghi**. Lọc theo **ĐIỀU KIỆN**, đừng lọc theo
  prefix mã — script 3/8 lọc `KK20260803-*` nên bỏ sót 26 lô của kiểm kê 14/07.
- Người dùng báo lỗi kèm danh sách sản phẩm → **đó không phải danh sách SP lỗi**.
  Một dòng hàng thiếu tồn là **cả đơn tắc**, nên họ kể tên hết cả đơn.
- Sửa 1 cột dữ liệu → **kiểm hệ quả dây chuyền**: cron nào đọc nó, cột lưu sẵn
  nào phái sinh từ nó, báo cáo nào dùng nó.
- **Mã API cho người ngoài app: khoá phạm vi theo `userId`, KHÔNG theo `role`.**
  Đức là admin — nếu mã "mượn" quyền role thì đọc luôn khách cả công ty + giá vốn.
  Namespace `/api/ext/v1` bắt buộc `assignedUserId = ctx.userId` + whitelist field.
- **Kiểm chứng SQL: cột Prisma là `timestamp without time zone` (naive UTC).**
  So sánh với literal có offset (`'2026-07-16 00:00:00+07'`) thì Postgres quy đổi
  theo TZ *phiên psql* → lệch 7h, ra số sai. Muốn mốc 00:00 giờ VN thì viết literal
  naive đã trừ 7h (`'2026-07-15 17:00:00'`), hoặc `col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'`.
- **Lọc phạm vi phải ở BACKEND — comment "frontend ẩn rồi" là không đủ.**
  `/contacts/export` lọc member đúng kèm ghi chú "frontend ẩn KH khác", nhưng
  frontend không hề lọc và list/detail/pipeline thì quên → mọi user CRM đọc được
  khách cả công ty (fix 24/8/2026, `modules/contacts/contact-scope.ts`).
- **Ép phạm vi SAU khi build xong `where`.** Route nào có
  `if (assignedUserId) where.assignedUserId = <query>` mà ép phạm vi trước thì
  member chỉ cần truyền `?assignedUserId=<người khác>` là ghi đè được (export dính thật).
- **Chậm là do gọi nhiều lần, không phải do code chậm.** Đo 25/8/2026: mỗi lần
  gọi API tới Singapore ~85ms, app không cache → mỗi lần chuyển màn trả giá lại
  từ đầu. Giữ màn bằng `<KeepAlive>` + làm mới ngầm cắt 58% thời gian chờ.
- **`include` của Prisma kéo về TOÀN BỘ cột.** Danh sách đơn từng chở 73 cột/đơn
  (ghi chú, lý do huỷ, ảnh giao hàng) — đổi sang `select` giảm 37% dữ liệu.
- **`nulls last` trong orderBy làm Postgres bỏ index.** Cùng truy vấn: 36,7ms quét
  toàn bảng → 0,2ms dùng index sau khi bỏ `nulls last` + khai index đúng chiều sắp xếp.
- **Trước khi tối ưu phải ĐO.** Nghi Vercel là nút thắt (đo lần đầu +250ms), giữ
  kết nối đo lại thì gần bằng nhau — nút thắt thật nằm ở chỗ khác. Nếu tin số đo
  đầu tiên thì đã đi sửa nhầm chỗ.
- **`errorResponseBuilder` của @fastify/rate-limit: hình dạng trả về quyết định cả
  status lẫn body.** Plugin `throw` thẳng thứ hàm này trả ra và lỗi đó KHÔNG đi qua
  `setErrorHandler` của app: object thuần `{ error }` → HTTP **500**; `new Error(msg)`
  + `statusCode` → 429 nhưng body `{ error:'Too Many Requests', message: <câu Việt> }`
  nên frontend (đọc `data.error`) vẫn hiện chữ Anh. Đúng là `{ statusCode: 429, error }`
  (đo 25/8/2026 ở `/api/v1/tax-lookup`) — đổi thì phải bấm thử vượt hạn mức lại.
- **API ngoài chỉ được ĐIỀN GIÚP, không được chặn.** Nút tra cứu MST (VietQR) hỏng,
  quá tải hay mất mạng thì form vẫn phải gửi được như cũ; header `x-ratelimit-limit: 2`
  của họ cũng không phản ánh thực tế (4 lượt song song vẫn qua) → cứ cache + lỗi mềm,
  đừng thiết kế dựa vào hạn mức nhà cung cấp công bố.
- **Endpoint map tay response thì `select` thêm cột là vô nghĩa.**
  `PUT /sale-app/customers/:id` build lại object snake_case bằng tay → thêm
  `assignedUser` vào `select` mà quên thêm vào khối `return` là FE không bao giờ
  thấy (25/8/2026). Sửa response shape phải xem CẢ `select` lẫn chỗ map.
- **Chặn phạm vi phải chặn ở endpoint GHI, không chỉ ở endpoint TÌM.** Ẩn khách khỏi
  ô tìm kiếm là chưa đủ: ai biết `contactId` (đơn cũ, F12) vẫn POST được đơn. Luật
  "khách của ai người ấy lên đơn" (25/8/2026) phải cắm ở 3 chỗ: search + POST /orders
  + PUT /customers (đổi người phụ trách) — thiếu 1 chỗ là lách được cả 3.
