# ZCA (Zalo) Integration — Mindset & Giải pháp

## 1. ZCA là gì?

**ZCA-JS** (github.com/RFS-ADRENO/zca-js) là thư viện JavaScript **không chính thức** (unofficial) để tương tác với Zalo. Nó hoạt động bằng cách **giả lập Zalo Web** — đăng nhập bằng QR code, giữ session qua cookies, nhận/gửi tin nhắn qua WebSocket.

### Khác biệt với Zalo OA API

| | Zalo OA (Official) | ZCA-JS (Unofficial) |
|---|---|---|
| Loại tài khoản | Zalo Official Account (doanh nghiệp) | Zalo cá nhân |
| Đăng ký | Cần duyệt từ Zalo | Không cần |
| Chat 2 chiều | Giới hạn (reply 24h) | Không giới hạn |
| Rủi ro | Không | Có thể bị khóa account |
| Real-time | Webhook/polling | WebSocket trực tiếp |

### Tại sao chọn ZCA-JS?

Phòng khám sử dụng **Zalo cá nhân** của nhân viên để chat với bệnh nhân. Zalo OA không phù hợp vì:
- Bệnh nhân không follow OA
- Nhân viên đã có mối quan hệ qua Zalo cá nhân
- Cần quản lý tập trung nhiều Zalo cá nhân

---

## 2. Các vấn đề phát sinh & Giải pháp

### 🔴 Vấn đề 1: Account bị Zalo khóa/ban

**Nguyên nhân:**
- Gửi tin nhắn quá nhanh (>5 tin/30 giây)
- Gửi quá nhiều tin/ngày (>200 tin)
- Gửi nội dung giống nhau cho nhiều người (spam)
- Hành vi bất thường (gửi lúc ban đêm, gửi cho người lạ)

**Giải pháp CRM-Med:**
- ✅ **Rate Limiter:** Tự động giới hạn 200 tin/ngày, max 5 tin/30 giây
- ✅ **Queue:** Tin nhắn được xếp hàng, gửi cách nhau tối thiểu 3 giây
- ✅ **Warning:** Hệ thống cảnh báo khi gần đạt giới hạn
- ⚠️ **Quy tắc cho nhân viên:**
  - Không gửi tin giống nhau cho nhiều người
  - Không gửi tin cho người không phải bạn bè
  - Không gửi tin lúc 00:00-06:00

---

### 🟡 Vấn đề 2: Session hết hạn / mất kết nối

**Nguyên nhân:**
- Zalo server timeout (code 1006)
- Cookies hết hạn (thường sau 30 ngày)
- Mạng internet bị gián đoạn
- Nhân viên mở Zalo Web trên trình duyệt → kick session

**Giải pháp CRM-Med:**
- ✅ **Auto-reconnect:** Khi mất kết nối → tự kết nối lại sau 30 giây
- ✅ **Health check:** Mỗi 5 phút kiểm tra tất cả accounts
- ✅ **Daily refresh:** Mỗi ngày lúc 11:00 AM tự disconnect + reconnect để làm mới session
- ✅ **Notification:** Thông báo ngay khi account mất kết nối
- ✅ **Session persistence:** Lưu cookies vào DB → khôi phục khi restart server
- ⚠️ **Quy tắc:** Nhân viên KHÔNG được mở Zalo Web trên browser khi đang dùng CRM

---

### 🟡 Vấn đề 3: Tin nhắn bị mất / không nhận được

**Nguyên nhân:**
- Listener bị disconnect mà chưa reconnect
- Tin nhắn gửi trước khi kết nối CRM → không có trong hệ thống

**Giải pháp CRM-Med:**
- ✅ **Lưu tất cả tin nhắn** vào DB — kể cả tin bị xóa/thu hồi
- ✅ **Auto-reconnect** đảm bảo luôn lắng nghe tin nhắn
- ⏳ **Backlog:** Đồng bộ tin nhắn cũ khi kết nối lần đầu (chưa implement)

---

### 🟠 Vấn đề 4: Nhiều nhân viên dùng cùng 1 Zalo

**Tình huống:** 1 Zalo Hotline, 3 nhân viên cùng trả lời khách

**Giải pháp CRM-Med:**
- ✅ **Zalo Account Access:** Phân quyền read/chat/admin per user
- ✅ **Rate limiter shared:** Tất cả người dùng cùng account chia sẻ giới hạn
- ✅ **Activity log:** Ghi lại ai gửi tin nào (repliedByUserId)

---

### 🟠 Vấn đề 5: Bệnh nhân chat từ nhiều kênh

**Tình huống:** Cùng 1 bệnh nhân nhưng chat qua Zalo nhân viên A, Zalo nhân viên B, và đến khám trực tiếp

**Giải pháp CRM-Med:**
- ✅ **Patient Directory:** Danh bạ bệnh nhân merge theo số điện thoại
- ✅ **Auto-merge:** Tự động nhóm contacts có cùng SĐT thành 1 Patient
- ✅ **Multi-source:** 1 Patient có nhiều Contacts (nhiều kênh)
- ✅ **Unified view:** Xem tất cả lịch sử từ mọi kênh tại 1 nơi

---

## 3. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────┐
│              CRM-Med Web App                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────┐  │
│  │ Chat │ │ KH   │ │Bệnh │ │ Dashboard  │  │
│  │      │ │      │ │nhân  │ │ & Reports  │  │
│  └──┬───┘ └──┬───┘ └──┬───┘ └─────┬─────┘  │
│     │        │        │           │          │
│  ┌──┴────────┴────────┴───────────┴──────┐  │
│  │         Node.js Backend               │  │
│  │  ┌─────────┐ ┌─────────┐ ┌────────┐  │  │
│  │  │ ZCA Pool│ │ Rate    │ │ AI     │  │  │
│  │  │ (5 acc) │ │ Limiter │ │ Engine │  │  │
│  │  └────┬────┘ └─────────┘ └────────┘  │  │
│  └───────┼───────────────────────────────┘  │
│          │ WebSocket x 5                     │
│  ┌───────┴───────┐  ┌──────────────────┐   │
│  │  Zalo Server  │  │  PostgreSQL DB   │   │
│  └───────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## 4. Giới hạn kỹ thuật cần biết

| Giới hạn | Mô tả | Ảnh hưởng |
|----------|-------|-----------|
| 1 session/account | Không thể mở Zalo Web + CRM cùng lúc | Nhân viên chỉ dùng CRM |
| QR login | Khi session hết hạn hoàn toàn, phải scan QR lại | ~1 lần/tháng |
| Unofficial API | Zalo có thể thay đổi API bất cứ lúc nào | Pin version zca-js |
| No history | Không lấy được tin nhắn trước khi kết nối | Chỉ có tin mới |
| Rate limit | Gửi quá nhanh → bị block tạm/vĩnh viễn | Tuân thủ rate limiter |
