# Trợ lý thu tiền — 01/10/2026

## Phạm vi

CRM và sale-app có màn `/receipt-assistant` dành cho owner/admin đang hoạt động; backend kiểm tra quyền mới nhất trong DB. Không cấp thêm quyền cho nhân viên.

Tải tối đa 5 ảnh PNG/JPEG/WEBP (8 MB mỗi ảnh), đọc từng bill, gợi ý khách theo tên/điện thoại và cách ghi nhận. Kế toán sửa thông tin đọc ảnh, chọn khách rồi xem trước trước khi xác nhận. Các khoản khác ngày cần tách thành lượt thu riêng; bổ sung chứng từ vào phiếu cũ có thể gồm các bill khác ngày.

- Thu công nợ: phân bổ vào các đơn nợ cũ nhất, cập nhật đã thu/nợ, giữ tổng tiền đơn.
- Bổ sung chứng từ: giữ số tiền/ngày/phân bổ phiếu cũ, thêm ảnh và nhật ký.
- Ứng trước: ghi `unallocated_amount`, không tự giảm nợ từng đơn; bước phân bổ tiền ứng trước cho đơn tương lai chưa nằm trong bản này.
- Xác nhận dùng bản xem trước đã lưu, khóa và transaction Serializable, kiểm tra lại số dư và chứng từ; retry cùng draft/token không tạo thêm tiền.
- Chặn ảnh/mã giao dịch đã dùng, cảnh báo phiếu cũ cùng tiền/ngày. Các ảnh lịch sử chưa được lập chỉ mục hash không được đảm bảo nhận diện trùng tự động.

## AI và dữ liệu ảnh

Đọc ảnh dùng cấu hình AI tổ chức tại `/ai-settings`: `ai_provider`, `ai_api_key`, `ai_model`, `ai_base_url`. Hỗ trợ OpenAI, Gemini, Claude, endpoint tương thích OpenAI được cấu hình rõ ràng. Cần mô hình có khả năng nhận ảnh. Không gửi bill tới endpoint mặc định khi chưa cấu hình; không gửi danh bạ/số dư tới mô hình. Khóa chỉ nằm phía server. AI chỉ trích xuất dữ liệu; toàn bộ số dư/phân bổ do phần mềm tính từ DB.

Tại thời điểm xây dựng tổ chức production chưa có cấu hình AI. Luồng nhập tay/dò khách/xem trước/xác nhận hoạt động; khả năng đọc bill tự động cần khóa và mô hình hợp lệ rồi kiểm thử trên bill thật. Không coi kiểm thử parser với phản hồi giả lập là kiểm thử OCR thật.

## Dữ liệu và triển khai

`backend/src/modules/receipt-assistant/schema.sql`: thêm cột `customer_payments.unallocated_amount` mặc định 0; thêm `receipt_assistant_drafts`, `receipt_assistant_evidence` có RLS và chỉ được backend truy cập. Không sửa số tiền/công nợ cũ. Bản nháp hết hạn sau24h; xem trước sau10phút. Dữ liệu bản nháp/ảnh chưa có tác vụ tự xóa trong bản này.

Backend + CRM deploy từ `feature/sale-app-nhom1`. Sale-app commit riêng cherry-pick sang `main`.

## Kiểm tra

- `scripts/test-receipt-assistant.ts`: Fastify + database localhost thực, bộ dữ liệu riêng được dọn; phân quyền, khác tổ chức, thu nợ, ứng trước, bổ sung ảnh, duplicate hash/ref, retry/concurrency, stale preview, ngày/số tiền.
- `scripts/test-receipt-upload.ts`: multipart thật, giới hạn ảnh, duplicate và manual fallback; lưu trữ mock, không gửi ảnh ra ngoài.
- `scripts/test-receipt-extraction.ts`: kiểm định JSON mô hình, số nguyên VND, ngày; không gọi mô hình thật.
- Trình duyệt: sale-app thu400.000đ từ nợ1.000.000đ ->600.000đ; CRM bổ sung ảnh vào phiếu374.000đ giữ nguyên tiền/nợ; dùng dữ liệu localhost riêng. Build ba app.
