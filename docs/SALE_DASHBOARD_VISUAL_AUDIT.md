# Sale Dashboard — Visual & Layout Audit

## Đối chiếu với thiết kế chuẩn

### Đã bổ sung / hiệu chỉnh

- Dashboard desktop dùng toolbar riêng: lời chào, tháng hiện tại, thông báo và phạm vi bộ lọc.
- Bỏ giới hạn `max-width: 1536px`; nội dung dùng toàn bộ vùng còn lại sau sidebar.
- Sidebar dashboard có doanh số tháng, tiến độ target, forecast, forecast gap và thời điểm cập nhật.
- Today Action trở lại bảng 5 hàng compact; thao tác hoãn nằm trong menu `•••`, hoàn tất nằm ở cột trạng thái.
- KPI Tree hiển thị đúng cấu trúc mục tiêu doanh thu = Active × Frequency × AOV và shortfall.
- Customer Health có 5 trạng thái, thanh tỷ lệ, tỷ lệ từng nhóm và drill-down.
- Pipeline có tiêu đề cột, bộ lọc stage và đủ 5 hàng khi dữ liệu có sẵn.
- Product Opportunity và Leaderboard hỗ trợ tối đa các hàng theo contract; số hàng thực tế phụ thuộc dữ liệu.
- Utility modules tiếp tục nằm cuối trang.

## Dữ liệu vẫn còn thiếu

- `Doanh thu / 1 giờ bán hàng`: chưa có timesheet hoặc giờ làm việc của sale, nên sidebar hiển thị `—/giờ` thay vì suy diễn.
- Xem dashboard theo tháng lịch sử: API hiện tính Today Action theo thời điểm hiện tại; selector tháng chỉ mô tả phạm vi hiện hành, chưa gửi query lịch sử.
- Bộ lọc cá nhân có lưu cấu hình: chưa có setting/filter contract; toolbar hiện giải thích ba bộ lọc hệ thống đang áp dụng.
- Khuyến mãi: chưa có nguồn promotion thật.
- Zalo CTA theo contact: chưa có liên kết Zalo chuẩn hóa trên hồ sơ khách.
- Ảnh đại diện sale: API leaderboard chưa trả avatar.

## Quy tắc layout và zoom

- Container chính là fluid `width: 100%`; không khóa max-width.
- Từ `2xl`, khu vực chính dùng 12 cột: Today Action 8 cột, KPI/Health 4 cột.
- Dưới `2xl`, Today Action dùng toàn chiều rộng; KPI và Health chuyển xuống dưới.
- Dưới `lg`, sidebar biến thành bottom navigation, action chuyển sang card một cột.
- Không dùng chiều rộng tuyệt đối cho toàn trang; chỉ giữ độ rộng sidebar và các cột thao tác tối thiểu.
- Visual QA đã kiểm tra các CSS viewport tương đương zoom out, 100%, zoom in và mobile; mọi mức đều có `scrollWidth === clientWidth`.

## Không thực hiện trong đợt này

- Không đổi database/schema.
- Không thêm dữ liệu kinh doanh mẫu vào production.
- Không tạo route giả cho Cơ hội/Báo giá khi module thật chưa tồn tại.
