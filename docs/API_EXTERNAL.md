# API cho app do nhân viên tự viết (`/api/ext/v1`)

> Tài liệu này gửi cho nhân viên được cấp mã API (VD: Đức tự viết app quản lý khách của Đức).
> Nội bộ: xem thêm `CLAUDE.crm.md`. Cấp/thu hồi mã: CRM → **Cài đặt → Mã API** (owner/admin).

## 1. Mã API

Mỗi nhân viên được anh Philip cấp 1 mã dạng `halo_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

- Mã **chỉ hiện 1 lần** lúc cấp. Mất → xin cấp lại (mã cũ bị thu hồi).
- Mã = chìa khoá dữ liệu khách. **Không** đưa mã vào code đẩy lên GitHub, không dán vào chat nhóm.
  Để trong biến môi trường của app.
- Nghi bị lộ → báo ngay để thu hồi. Thu hồi có hiệu lực tức thì.

Gắn mã vào **mọi** request bằng header:

```
X-Api-Key: halo_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 2. Địa chỉ

| Môi trường | Base URL |
|---|---|
| Production | `https://halo-sale-backend.onrender.com` |
| Máy dev nội bộ | `http://localhost:3000` |

⚠️ Gọi từ **server/máy của app** (Node, Python, n8n, Google Apps Script…).
Hiện **chưa mở CORS** cho namespace này nên gọi trực tiếp từ JavaScript trong trình duyệt
ở tên miền khác sẽ bị chặn — cần thì báo để mở riêng.

## 3. Phạm vi dữ liệu (đọc kỹ)

- Mã chỉ đọc được **khách hàng có ô "sale phụ trách" = chính nhân viên sở hữu mã**, và đơn hàng
  của đúng những khách đó. Khách của người khác trả `404` như thể không tồn tại.
- **Chỉ đọc.** Mọi thao tác tạo/sửa/xoá chưa mở (sẽ có ở đợt sau).
- **Không** trả giá vốn, lãi gộp, giá nhập dưới bất kỳ hình thức nào.
- Giới hạn **60 lượt gọi/phút** cho mỗi mã. Vượt → `429`, chờ sang phút sau.

## 4. Endpoint

### 4.1 `GET /api/ext/v1/me` — kiểm tra mã

```bash
curl -H "X-Api-Key: $HALO_API_KEY" https://halo-sale-backend.onrender.com/api/ext/v1/me
```

```json
{ "user": { "id": "…", "fullName": "Lê Huỳnh Đức" }, "scope": "own_customers_read" }
```

### 4.2 `GET /api/ext/v1/customers` — danh sách khách của mình

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `page` | 1 | trang |
| `limit` | 50 | số dòng/trang, **tối đa 100** |
| `search` | — | tìm theo tên, tên nhà thuốc, SĐT, mã KH |
| `updatedSince` | — | `YYYY-MM-DD` — chỉ lấy khách có thay đổi từ **00:00 giờ Việt Nam** ngày đó (dùng để đồng bộ tăng dần) |

```bash
curl -H "X-Api-Key: $HALO_API_KEY" \
  "https://halo-sale-backend.onrender.com/api/ext/v1/customers?limit=20&updatedSince=2026-08-01"
```

```json
{
  "customers": [
    {
      "id": "f51c4328-…", "customerCode": "KH006",
      "fullName": "Di Di (Yến Nhi)", "storeName": null, "phone": "0907586210",
      "province": "Bắc Ninh", "address": null,
      "customerType": null, "scale": null,
      "stage": "tiep_can", "policyTier": "thung_1", "customerRank": null,
      "source": "sale_app", "tags": [], "notes": null, "birthday": null,
      "lastOrderDate": "2026-07-02T…", "nextContactDate": null,
      "createdAt": "…", "updatedAt": "…"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

### 4.3 `GET /api/ext/v1/customers/:id` — chi tiết 1 khách

Trả `{ "customer": { … } }` (cùng bộ field như trên). Khách không phải của mình → `404`.

### 4.4 `GET /api/ext/v1/customers/:id/orders` — đơn của khách đó

Tham số `page`, `limit` như trên. Sắp xếp đơn mới nhất trước.

```json
{
  "orders": [
    {
      "id": "…", "orderCode": "DH-202608-12",
      "orderDate": "2026-08-14T…", "status": "completed",
      "totalAmount": 17760000, "paidAmount": 17760000, "debtAmount": 0,
      "debtDueDate": null, "shippingMethod": "cod", "trackingCode": null,
      "createdAt": "…"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 49, "totalPages": 1 }
}
```

Tiền là **số nguyên đồng VND** (17760000 = 17.760.000 đ), không có số thập phân.

**Giá trị `status` có thể gặp:**

| Mã | Nghĩa |
|---|---|
| `draft` | đơn nháp |
| `confirmed` | đã xác nhận |
| `packing` | đang đóng gói |
| `shipping` | đang giao |
| `completed` | hoàn tất |
| `returned` | trả hàng |
| `cancelled` | đã huỷ |
| `opening_balance` | dòng **số dư công nợ đầu kỳ** (mã `NDK-…`), không phải đơn bán thật |

⚠️ Khi tính doanh số: **bỏ** `cancelled` và `returned`. `opening_balance` chỉ là công nợ mang sang,
đừng cộng vào doanh số.

## 5. Mã lỗi

| HTTP | Nghĩa | Xử lý |
|---|---|---|
| 401 | thiếu mã / mã sai / mã đã thu hồi | kiểm header `X-Api-Key`, xin cấp lại nếu cần |
| 403 | nhân viên bị vô hiệu hoá, hoặc mã không đủ quyền | báo anh Philip |
| 404 | không tìm thấy — hoặc khách không thuộc mình | không truy vấn khách của người khác |
| 400 | tham số sai (VD `updatedSince` không đúng `YYYY-MM-DD`) | sửa tham số |
| 429 | vượt 60 lượt/phút | chờ 1 phút, gọi thưa hơn, dùng `limit` lớn thay vì gọi nhiều lần |
| 500 | lỗi hệ thống | báo lại kèm thời điểm gọi |

## 6. Mẹo dùng cho app đồng bộ

- Lần đầu: kéo hết bằng `page`/`limit=100`.
- Lần sau: chỉ kéo `updatedSince=<ngày chạy lần trước>` — nhẹ hơn nhiều.
- Mọi mốc ngày/giờ trong hệ thống tính theo **giờ Việt Nam (UTC+7)**. Trường `birthday` là
  ngày-không-giờ (`YYYY-MM-DD`); các trường còn lại là thời điểm đầy đủ dạng ISO.
