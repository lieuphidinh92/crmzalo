# Hướng dẫn deploy sale.halo.com.vn

Mô hình: **Vercel** (giao diện) + **Render** (backend Node) + **Supabase** (database).

```
sale.halo.com.vn → Vercel → (/api chuyển tiếp) → Render (backend) → Supabase (database)
```

Ký hiệu: 👤 = anh tự bấm · 🤖 = Claude/kỹ thuật làm.

---

## Chuẩn bị (1 lần)
- 👤 Tài khoản **Supabase**, **Render**, **Vercel** (đăng nhập bằng GitHub `lieuphidinh92` cho tiện).
- 👤 Quyền sửa **DNS** của `halo.com.vn`.
- 🤖 Code cấu hình đã sẵn trong repo (`render.yaml`, `vercel.json`, `.env.production.example`).

---

## Bước 1 — Tạo database trên Supabase  👤
1. supabase.com → **New project**. Region chọn **Southeast Asia (Singapore)**.
2. Đặt **Database Password** mạnh → **lưu lại** (sẽ dùng ở bước sau).
3. Đợi project tạo xong (~2 phút).
4. Bấm nút **Connect** (trên cùng) → tab **Session pooler** → copy chuỗi `postgresql://...:5432/postgres`.
   → Đây là **DATABASE_URL**. (Dùng *Session pooler*, KHÔNG dùng Transaction/Direct.)

## Bước 2 — Chuyển dữ liệu thật lên Supabase  🤖 (anh cấp chuỗi ở Bước 1)
> Backup toàn bộ khách / đơn / công nợ / giá vốn từ máy anh → đưa lên Supabase. **Không mất dữ liệu** (chỉ copy).

```bash
# (a) Sao lưu từ database local trên máy (Claude chạy)
pg_dump "$LOCAL_DATABASE_URL" --no-owner --no-privileges -Fc -f /tmp/halo-backup.dump

# (b) Nạp vào Supabase (thay bằng Session pooler URL ở Bước 1)
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "postgresql://postgres.xxxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  /tmp/halo-backup.dump
```
- ✅ Kiểm tra: vào Supabase → **Table Editor** thấy các bảng (contacts, orders, products…) có dữ liệu.

## Bước 3 — Đẩy code mới nhất lên GitHub  🤖
```bash
git push origin feature/sale-app-nhom1
```

## Bước 4 — Deploy backend lên Render  👤 (em hướng dẫn từng click)
1. render.com → **New** → **Blueprint** → chọn repo **crmzalo** → Render đọc `render.yaml`.
2. Vào service `halo-sale-backend` → **Environment** → điền các biến `sync:false`:
   - `DATABASE_URL` = chuỗi Session pooler (Bước 1)
   - `ENCRYPTION_KEY` = **copy y hệt** từ `.env` máy anh ⚠ (đổi key → Zalo không giải mã được)
   - `JWT_SECRET` = copy từ `.env` (hoặc để Render tạo mới → mọi người đăng nhập lại)
   - `APP_URL` = `https://sale.halo.com.vn`
   - `PUBLIC_URL` = `https://sale.halo.com.vn`
3. **Create / Deploy** → đợi build xong → copy **URL backend** (vd `https://halo-sale-backend.onrender.com`).
4. ✅ Mở `URL-backend/api/v1/brands` → thấy `{"error":"Unauthorized"}` là backend sống.

## Bước 5 — Cập nhật vercel.json + deploy giao diện lên Vercel
1. 🤖 Sửa `sale-app/vercel.json`: đổi `https://halo-sale-backend.onrender.com` thành URL backend thật (Bước 4) → `git push`.
2. 👤 vercel.com → **Add New → Project** → chọn repo **crmzalo**.
   - **Root Directory**: `sale-app`
   - Framework: **Vite** (tự nhận) · Build: `npm run build` · Output: `dist`
3. **Deploy** → được URL tạm `...vercel.app` → mở thử thấy màn đăng nhập là OK.

## Bước 6 — Gắn tên miền sale.halo.com.vn  👤
1. Vercel → Project → **Settings → Domains** → thêm `sale.halo.com.vn`.
2. Vercel báo bản ghi DNS (thường **CNAME** → `cname.vercel-dns.com`).
3. Vào trang quản lý DNS `halo.com.vn` → thêm bản ghi đó → đợi 5–30 phút.
4. ✅ Mở `https://sale.halo.com.vn` → có https, đăng nhập được.

## Bước 7 — Tạo tài khoản nhân viên + nghiệm thu  🤖 + 👤
- Tạo user cho từng sale (qua tài khoản admin).
- Test: đăng nhập → tạo 1 đơn thử → xem **Biên bản bàn giao** (không có giá) + Hoá đơn (có giá) → in/tải.

---

## Lưu ý
- **Zalo**: sau khi lên server mới có thể cần **quét lại QR đăng nhập Zalo** (Zalo gắn phiên theo thiết bị/IP). Giữ đúng `ENCRYPTION_KEY` để không mất cấu hình.
- **Nguồn dữ liệu thật từ giờ là Supabase** (không phải máy anh). Database local chỉ để anh dev/thử.
- **CRM admin (cổng 5173)** chưa deploy trong vòng này — chỉ deploy app bán hàng cho sale. Muốn đưa CRM lên sau là 1 việc riêng.
- **Backup**: Supabase gói Pro có backup hàng ngày; nên bật khi chạy thật (dữ liệu công nợ/giá vốn quan trọng).
