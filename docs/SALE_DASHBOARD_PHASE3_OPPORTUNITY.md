# Sale Dashboard — Phase 3: Opportunity & Drill-down

## Phạm vi

Phase 3 biến các khối “Sản phẩm nên bán”, “Sức khỏe tệp khách hàng” và “Cơ hội đang xử lý” thành điểm bắt đầu hành động. Không thêm bảng, không migration và không sinh dữ liệu mẫu.

## Nguồn dữ liệu

### Sản phẩm nên bán hôm nay

- Lịch sử 12 tháng từ `orders` và `order_items` trong cùng tổ chức.
- Chỉ lấy đơn thuộc nhóm trạng thái được tính doanh số (`COUNTABLE_STATUSES`).
- Sản phẩm đích phải đang active, cho phép bán, có `hasSales`, và tồn kho lớn hơn 0.
- Danh sách khách chỉ gồm khách active đang được sale đăng nhập phụ trách.

### Sức khỏe khách hàng

- Đơn hàng hợp lệ của từng contact do sale phụ trách.
- Chu kỳ mua lại là trung vị khoảng cách giữa các lần mua; khi chưa đủ lịch sử dùng ngưỡng mặc định hiện có.
- `Active`, `Need Attention`, `At Risk`, `Lost` dùng cùng phân loại với KPI và Today Action.
- `Reactivated` là khách có đơn trong tháng hiện tại sau một khoảng gián đoạn vượt ngưỡng Lost.

### Pipeline

- Dùng `contacts.stage`, `potentialValue` và `nextContactDate` hiện có.
- UI chỉ hiện pipeline đầy đủ khi ít nhất một cơ hội có giá trị tiềm năng hoặc ngày follow.
- Khi dữ liệu chưa đủ, dashboard hiển thị trạng thái thiếu dữ liệu thay vì tự ước lượng.

## Công thức market-basket

Mỗi contact tạo một basket gồm các sản phẩm đã mua trong 12 tháng. Với cặp có hướng `A → B`:

- `support(A,B)`: số contact khác nhau đã mua cả A và B.
- `confidence(A→B) = support(A,B) / buyers(A)`.
- `lift(A→B) = confidence(A→B) / (buyers(B) / totalBasketContacts)`.
- Chấp nhận khi `support >= 2`, `confidence >= 15%`, `lift >= 1`.

Một khách được gợi ý B khi khách đã mua A, chưa từng mua B trong phạm vi lịch sử đang xét, thuộc tập active của sale và B còn hàng. Nếu có nhiều nguồn A, chọn cặp có điểm `support × confidence × lift` cao nhất.

`potentialRevenue` của mỗi khách dùng giá bán mặc định của sản phẩm B (fallback về bảng giá đầu tiên); tổng sản phẩm là tổng tiềm năng của các khách phù hợp.

## Today Action

- Cross-sell tạo action key `opportunity:<contactId>`.
- Chỉ thêm khi contact chưa có action ưu tiên cao hơn là risk, reorder hoặc deal.
- Action tiếp tục dùng lifecycle Phase 2: hoàn tất trong ngày hoặc hoãn 3 ngày qua `tasks` metadata.
- Drill-down và action chỉ trả về khách thuộc phạm vi dữ liệu mà sale được xem.

## Khuyến mãi

Codebase hiện chưa có model/bảng/cấu hình khuyến mãi thật; màn `Promotions.vue` đang dùng dữ liệu mock. Vì vậy Phase 3 không dùng dữ liệu này để chấm cơ hội. `dataQuality.promotionConfigured` tiếp tục là `false` cho tới khi có nguồn dữ liệu chính thức.

## Contract trả về bổ sung

- `productOpportunities[]`: sản phẩm, tồn kho, confidence, support, doanh thu tiềm năng và `customers[]`.
- `customerHealth.details[]`: contact, nhóm sức khỏe, trạng thái reactivated, đơn gần nhất, số ngày chưa mua, chu kỳ và giá trị tiềm năng.
- `todayActions.actions[]`: có thể có `type = opportunity` cùng sản phẩm được đề xuất.

## Kiểm tra Phase 3

- Frontend production build phải thành công.
- Ba backend module dashboard phải bundle độc lập bằng esbuild.
- Kiểm tra read-only trên dữ liệu thực: không tạo task, không ghi target, không thay đổi database.
- Kiểm tra sale không có cơ hội đủ ngưỡng nhận mảng rỗng và UI empty-state rõ ràng.
