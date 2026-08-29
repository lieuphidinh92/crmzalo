# Sale Dashboard — Phase 4: Production Hardening

## Phạm vi

Phase 4 hoàn thiện STEP 6–7 của spec: responsive, loading, empty, error, permission và không làm hỏng luồng đang hoạt động. Phase này không đổi API contract, không migration và không thêm dữ liệu kinh doanh giả.

## Thay đổi chính

### Refresh và xử lý lỗi

- Header có nút làm mới và trạng thái đang cập nhật.
- Refresh nền không xóa dashboard đang hiển thị khi API lỗi.
- Khi refresh lỗi, dữ liệu thành công gần nhất tiếp tục được giữ cùng thời điểm cập nhật và CTA thử lại.
- Refresh thành công tự xóa cảnh báo dữ liệu cũ.

### Responsive

- Trên laptop, Today Action dùng toàn chiều rộng để các cột khách hàng, lý do, tiềm năng và hành động không bị nén.
- Layout hai cột Today Action/KPI chỉ bật trên màn hình từ 1800px.
- Hàng secondary chuyển thành hai cột trên laptop; leaderboard chiếm cả hàng khi chưa đủ chiều rộng cho ba cột.
- KPI Tree chuyển từ công thức một hàng sang lưới 2×2 trên mobile.
- Customer Health chuyển sang hai cột trên mobile.
- Drill-down khách hàng và sản phẩm dùng bottom sheet một cột, CTA đủ chiều rộng trên mobile.
- KPI cuối cùng chiếm trọn hàng trên mobile/tablet để tránh ô trống không cân đối.

### Trạng thái và quyền

- Loading skeleton, first-load error, empty state và permission của leaderboard tiếp tục được giữ.
- Sale chỉ mở được đơn của chính mình; owner/admin hoặc người có `canViewAllOrders` mới mở đơn nhân viên khác.
- Editor KPI chỉ hiển thị cho owner/admin.
- Modal hỗ trợ đóng bằng Escape bên cạnh nút đóng và click backdrop.

## Kiểm tra

- Production build của `sale-app`.
- Bundle độc lập ba dashboard backend modules bằng esbuild.
- Visual QA bằng contract mock tại 1366×900 và 390×844.
- Kiểm tra `scrollWidth === clientWidth` ở cả laptop và mobile.
- Kiểm tra refresh lỗi vẫn giữ KPI cũ, retry thành công xóa cảnh báo.
- Kiểm tra drill-down Customer Health và Product Opportunity trên mobile.
- File cấu hình mock chỉ dùng tạm cho QA, không đồng bộ vào repository chính.
