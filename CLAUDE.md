# [CLAUDE.md](http://CLAUDE.md) — Bộ Luật Vận Hành CRM [ngheduocsi.vn](http://ngheduocsi.vn)

> "Không phải ghi chú. Đây là luật. Đọc trước, code sau."
> Áp dụng cho mọi session, mọi tính năng, không có ngoại lệ.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🧠 RULE 1: PLAN TRƯỚC — CODE SAU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trước khi viết bất kỳ dòng code nào, BẮT BUỘC:

1. Đọc file này ([CLAUDE.md](http://CLAUDE.md)) từ đầu đến cuối
2. Đọc docs/SESSION_[HANDOFF.md](http://HANDOFF.md) nếu có
3. Đọc docs/LESSONS_[LEARNED.md](http://LEARNED.md) nếu có
4. Đọc các file liên quan đến task (component, schema, route)
5. Báo lại cho user:
   - Hiểu task như thế nào
   - File nào sẽ bị ảnh hưởng
   - Kế hoạch thực hiện từng bước
   - Rủi ro tiềm ẩn nếu có
6. Chờ user confirm TRƯỚC KHI CODE

Nếu đang code mà phát hiện sai hướng:
→ DỪNG NGAY
→ Báo user
→ Plan lại
→ KHÔNG cố đấm ăn xôi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🤖 RULE 2: VIỆC KHÓ — GIAO SUB-AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Giới hạn mỗi session:
- Tối đa 1-2 tính năng lớn per session
- Nếu task cần >300 dòng code mới → chia nhỏ, báo user
- Context window >70% → BẮT BUỘC báo user để clear

### Khi context sắp đầy, tạo ngay:
docs/SESSION_[HANDOFF.md](http://HANDOFF.md) với nội dung:
  - Phase đã hoàn thành (chi tiết file đã tạo/sửa)
  - Phase deferred (những gì chưa làm)
  - API endpoints đã tạo
  - Schema đã migrate
  - TODO cho session tiếp theo
  - Pattern/convention quan trọng cần nhớ

### Nguyên tắc giữ context sạch:
- Mỗi prompt = 1 nhiệm vụ rõ ràng
- Không ôm đồm nhiều module trong 1 session
- Tái sử dụng API đã có, KHÔNG tạo logic trùng

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📚 RULE 3: VÒNG LẶP TỰ CẢI THIỆN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Sau mỗi session, cập nhật docs/LESSONS_[LEARNED.md](http://LEARNED.md):

Format:
  [Ngày] - [Vấn đề gặp] - [Cách fix] - [Bài học]

Ví dụ:
  30/04 - Context đầy giữa chừng - Tạo [HANDOFF.md](http://HANDOFF.md) trước
        - Luôn commit Git trước khi qua prompt mới

### Đầu mỗi session MỚI:
  1. Đọc LESSONS_[LEARNED.md](http://LEARNED.md)
  2. Apply bài học ngay vào session này
  3. Không lặp lại lỗi cũ

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ✅ RULE 4: CHỨNG MINH NÓ HOẠT ĐỘNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Định nghĩa "xong":
Một task chỉ được gọi là XONG khi:
  ☐ Code đã chạy không lỗi compile
  ☐ Test thủ công đã pass (mô tả kết quả)
  ☐ Console/log không có error đỏ
  ☐ Edge case đã được kiểm tra
  ☐ Git đã được commit

### Sau mỗi tính năng, BẮT BUỘC báo:
  ✅ Đã test: [mô tả cách test]
  ✅ Kết quả: [Pass/Fail + chi tiết]
  ✅ File đã tạo mới: [list]
  ✅ File đã sửa: [list]
  ✅ Migration cần chạy: [list hoặc "Không có"]
  ✅ Sẵn sàng commit Git

### KHÔNG được phép nói "xong" nếu:
  ❌ Chưa chạy thử
  ❌ Còn console.error chưa xử lý
  ❌ Còn TODO comment chưa giải quyết
  ❌ Chưa test với data thật (dùng seed data)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🐛 RULE 5: GẶP BUG — TỰ TÌM ROOT CAUSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Khi gặp lỗi, quy trình bắt buộc:
  1. Đọc TOÀN BỘ error message + stack trace
  2. Xác định root cause (không đoán mò)
  3. Đề xuất 2 cách fix + trade-off của mỗi cách
  4. Chọn cách an toàn nhất
  5. Fix + verify không tạo bug mới
  6. Ghi vào LESSONS_[LEARNED.md](http://LEARNED.md) nếu là lỗi quan trọng

### KHÔNG được phép:
  ❌ Fix mà không hiểu tại sao lỗi
  ❌ Comment out code để "tạm bypass"
  ❌ Thay đổi file không liên quan để "thử xem"
  ❌ Báo "đã fix" mà chưa verify

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🏗️ KIẾN TRÚC PROJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Stack hiện tại:
  - Frontend: Vue 3 + Vuetify + Vite (localhost:5173)
  - Backend: Node.js + Fastify + Prisma 7 (ESM)
  - Database: PostgreSQL 16 (port 5432, local Homebrew)
  - DB name: zalocrm
  - Real-time: Socket.IO (chat đã wire, task notifications chờ Phase 2)

### Cấu trúc thư mục:
  /frontend   → Vue 3 + Vuetify app
  /backend    → Fastify API (modules dưới src/modules/<tên>/)
  /docs       → SESSION_HANDOFF, LESSONS_LEARNED
  /CLAUDE.md  → File này

### Nguyên tắc code:

#### Backend:
  - Mọi route đều cần `app.addHook('preHandler', authMiddleware)`
  - Phân quyền: 3 cấp `owner | admin | member` (KHÔNG có
    `sale_leader` / `sale` / `cskh`). Gate admin-only:
    `{ preHandler: requireRole('owner', 'admin') }`. Member-scoped
    list: filter `assignedToId = request.user.id`.
  - Format response: trả thẳng object/array (vd `{ tasks: [...] }`,
    `{ rules: [...] }`). Error: HTTP status code + `{ error: "msg" }`.
    KHÔNG dùng envelope `{ success, data, message, error }`.
  - Tất cả số tiền lưu dạng integer (đồng VND, không dùng float)
  - Timezone: Asia/Ho_Chi_Minh cho mọi cron job
  - Prisma 7 ESM quirk: `import pkg from '@prisma/client'; const { PrismaClient } = pkg;` (named import KHÔNG work)

#### Frontend:
  - Dark theme: giữ nguyên, không tự ý đổi màu
  - Số tiền format: 1,500,000 đ (có dấu phẩy)
  - Loading state: dùng skeleton, KHÔNG dùng spinner xấu
  - Empty state: phải có illustration + text, KHÔNG để trống
  - Mobile responsive: kiểm tra trước khi báo xong

#### Database:
  - Repo dùng `prisma db push` (schema-first, KHÔNG có thư mục
    `prisma/migrations/`). Đổi schema: sửa `schema.prisma` → chạy
    `npx prisma db push --url "$DATABASE_URL"` → `npx prisma generate`
  - Khi xoá column/model: nếu là cleanup hợp lệ user yêu cầu thì
    DROP thẳng (Phase 1 đã drop Patient/ContactDisease/Icd10Code).
    Chỉ giữ legacy alias khi schema còn ràng buộc với data prod.
  - Seed data phải idempotent (chạy nhiều lần không bị lỗi). Pattern:
    seed-on-first-use trong preHandler hook (xem `task-seeds.ts`,
    `learning-seeds.ts`)
  - `created_at` là chuẩn cho mọi bảng. `updated_at` chỉ thêm khi
    record thực sự cần track edit time (ví dụ: rules, settings).
    Append-only logs (StageHistory, ActivityLog, LearningProgress
    snapshots) chỉ cần created_at.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📦 MODULES ĐÃ BUILD (Đừng đụng vào nếu không cần)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### ✅ Hoàn thành:
  - Auth + phân quyền (3 cấp: owner / admin / member)
  - Khách hàng B2B sỉ (contacts) — đã remove trường phòng khám cũ
  - Tài khoản Zalo + Tin nhắn Zalo
  - Trả lời nhanh (Quick Replies - 5 template)
  - Báo cáo Resale
  - Pipeline cơ hội (Kanban 5 stage)
  - Dashboard CEO + Bảng đánh giá Sale (6 metrics + Score)
  - Dashboard cá nhân hoá theo role (Sale vs Admin)
  - Việc cần làm / Task Management (Phase 1)
  - Sidebar collapsible theo 5 nhóm
  - /tasks/learning — module học tập (Phase 2)
  - /settings/cadence — admin config 4 tab rules (Phase 2)

### 🔄 Đang build:
  - Compliance Score refactor (5 sub-metrics)
  - WebSocket realtime + audio + confetti

### ⏳ Chưa build (build sau):
  - SLA Tracker cho lead Facebook
  - Round-robin auto-assign lead
  - Reminder Engine
  - Unified Inbox (FB + Zalo)
  - AI Auto-reply
  - Bộ chỉ số vàng 12T

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🚨 NHỮNG GÌ TUYỆT ĐỐI KHÔNG ĐƯỢC LÀM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ❌ Xoá hoặc rename bảng database mà không có migration
  ❌ Thay đổi tên cột đang có data thật
  ❌ Sửa file auth/permission mà không báo trước
  ❌ Cài thêm thư viện lớn mà không hỏi user
  ❌ Thay đổi dark theme màu sắc tổng thể
  ❌ Đụng vào module Zalo API pool (rất nhạy cảm)
  ❌ Xoá seeded data cố định (task categories, quick reply templates)
  ❌ Hard-code secret/key vào code
  ❌ Push lên GitHub mà chưa check .gitignore có .env chưa
  ❌ Nói "đã xong" mà chưa test

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🎯 MÔ HÌNH KINH DOANH (Context quan trọng)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - Công ty: HaloVN / [ngheduocsi.vn](http://ngheduocsi.vn)
  - Mô hình: B2B bán sỉ TPCN (thực phẩm chức năng)
  - Kênh bán: Zalo là chính, Facebook là lead source
  - Tệp khách: Nhà thuốc / Sỉ online / Dược sĩ / Cửa hàng mẹ bé
  - Brands: Manhae (chính), Bioisland, Neubria...
  - Đây KHÔNG phải CRM phòng khám hay bán lẻ
  - Chu kỳ deal: 2-8 tuần
  - KPI quan trọng nhất: Tỷ lệ đại lý active + Retention 90 ngày

  → Mọi tính năng build ra phải phù hợp với
    mô hình B2B sỉ TPCN này.
    Nếu thấy tính năng không hợp lý → hỏi user trước khi build.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 💬 CÁCH GIAO TIẾP VỚI USER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - User là CEO, không phải developer
  - Giải thích bằng tiếng Việt, ngắn gọn, dễ hiểu
  - Khi báo lỗi: nói rõ lỗi gì, ảnh hưởng gì, fix thế nào
  - Khi cần quyết định: đưa ra 2-3 option + trade-off
  - KHÔNG dùng thuật ngữ kỹ thuật mà không giải thích
  - KHÔNG hỏi quá 1 câu trong cùng 1 lần

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> Đây là luật. Không phải gợi ý. Không có ngoại lệ.
> Last updated: 01/05/2026
