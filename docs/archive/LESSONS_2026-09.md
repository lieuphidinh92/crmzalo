# Bài học tháng 09/2026

## 06/09 — Phân biệt xác thực AMIS Kế toán và meInvoice

- Client Secret của Developer Portal không phải access_code của AMIS Kế toán.
- AMISKT lấy token bằng ClientID của sản phẩm AMIS Kế toán, access_code sinh
  trong Actapp và org_company_code do hệ thống tích hợp tự đặt.
- API MISA có thể đưa nguyên access_code không hợp lệ vào ErrorMessage. Client
  bắt buộc che ClientID/access_code trước khi ghi log hoặc trả lỗi cho frontend.
- Khi nhập secret, dùng file tạm hoặc prompt ẩn; xác nhận bằng trạng thái có/không,
  ghép vào .env rồi xóa file tạm ngay.
- Không được tin trực tiếp `contacts.misa_customer_code` hoặc SKU trùng tên giữa
  CRM và Actapp. Đối chiếu 06/09 cho thấy 206 khách có mã MISA cũ nhưng không mã
  nào khớp danh mục Actapp hiện tại; SKU `MH_04` còn trùng mã nhưng khác sản phẩm.
  Trước khi tạo chứng từ phải xác minh khách theo MST/tên và hàng hóa theo cả mã +
  tên; trường hợp lệch phải chặn cứng và yêu cầu chọn/tạo danh mục đúng trên Actapp.
- Chuẩn SKU chốt 06/09: Menopause 120 dùng `MH_04`, Pregnancy dùng `MH_10`.
  Khi đổi mã sản phẩm phải cập nhật cả `order_items.sku` và dựng lại
  `orders.product_skus`; chỉ xóa mã cũ sau khi xác nhận tồn kho và mọi quan hệ đều 0.
- API `save_dictionary` và `save` của AMIS Kế toán đều chạy bất đồng bộ. HTTP
  nhận thành công chỉ được ghi trạng thái `pending`; callback thành công mới tạo
  `VatInvoice`. Callback phải idempotent và được bảo vệ bằng secret riêng.
- Trước khi gửi chứng từ phải chặn cứng nếu tổng các dòng giá đã gồm VAT khác
  tổng tiền bán lẻ. Thuế suất được chỉnh từng dòng, nhưng phép tách giá trước
  thuế + tiền thuế luôn phải cộng lại đúng giá bán sau VAT.
- Khi AMIS đã cấu hình, endpoint xác nhận hoá đơn thủ công phải trả 409; nếu chỉ
  đổi nút ở frontend thì vẫn còn đường API làm đơn CRM lệch Actapp.
