# LESSONS_LEARNED.md

Bài học rút ra qua từng session để không lặp lỗi cũ. Đầu mỗi session
mới, đọc file này trước khi code (Rule 3 trong CLAUDE.md).

Format: `[Ngày] - [Vấn đề] - [Cách fix] - [Bài học]`

---

## 08/05/2026 — DS NV Sale tính sai 92% do nhầm `contact.assignedUserId` với `order.assignedSaleId`

**Vấn đề**:
- Sale "Nguyễn Thành Đạt" hiển thị 1.4tr trên "Top NV Sale tháng",
  ground truth từ DB là 16.265tr (sai 92%).
- Lan rộng: Sale Performance Dashboard CEO, member view KPI/Top SP/
  Top KH cũng cùng sai semantic.

**Root cause**:
Hai khái niệm khác nhau bị code nhầm là một:
- `contact.assigned_user_id` = "ai sở hữu/quản lý contact này"
- `order.assigned_sale_id` = "ai chốt đơn này"

Logic doanh số sale (`calculateResaleRevenue`,
`calculateNewAgentRevenue`, `withSaleScope` ở overview-service) đều
filter qua `contact.assignedUserId` thay vì `order.assignedSaleId`.

Bug bị khuếch đại bởi MISA import script: contact mới import
default-own = Admin, nên 5/6 đơn của Đạt bị tính lệch sang Admin.

**Cách fix (Option B — fix gốc)**:
- `calculateResaleRevenue`, `calculateNewAgentRevenue`: đổi filter
  `contact: { assignedUserId, ... }` → `assignedSaleId, contact: { ... }`
- `withSaleScope`: đổi từ thêm `contact.assignedUserId` → thêm
  `assignedSaleId` ở cấp order
- Inline filters trong `getTopCustomers` (at_risk) và
  `getAtRiskCustomers`: tương tự
- Bonus filter status: thêm `status IN (confirmed, shipped, completed)`
  cho mọi aggregate revenue (loại `draft` chưa chốt + `cancelled`)
- KHÔNG đổi semantic của `calculateActiveRate`, `calculateNewAgents`,
  `calculateRetention90d`, `calculateConversionRate`,
  `calculateAiInsightUsageScore` — những hàm này đếm CONTACTS, semantic
  `contact.assignedUserId` ("đại lý của tôi") là đúng.

**Bài học**:
1. **Hai cột FK lookup khác nhau ≠ đồng nhất.** Khi schema có cả
   `order.assigned_sale_id` lẫn `contact.assigned_user_id`, mỗi cột
   đại diện cho 1 semantic riêng. Trước khi viết logic
   "doanh số/đại lý của sale X", hỏi rõ: tính theo ai chốt đơn hay ai
   sở hữu contact?
2. **Test với data mismatch.** Lỗi này không xuất hiện trên data
   seed (mọi contact tự-assign đúng sale tạo nó). Chỉ lộ ra khi MISA
   import gây mismatch giữa 2 cột. → Test case bắt buộc: tạo đơn
   của sale A cho contact của sale B, verify metric.
3. **Filter status mặc định.** Đơn `draft` chưa chốt và `cancelled`
   đã huỷ KHÔNG được đếm vào doanh số. Mọi aggregate revenue mới
   phải gate `status IN (confirmed, shipped, completed)`.
4. **Audit ground truth trước khi sửa.** Khi user báo "số sai",
   chạy SQL trực tiếp để có "truth" tuyệt đối, rồi reproduce lại
   logic API bằng SQL để xác định chính xác đơn nào bị thiếu/dư.
   Không đoán mò "có thể do X".
5. **Cache không phải scapegoat đầu tiên.** Cache 5min với key chứa
   `from+to+saleId+orgId` → cache miss đúng khi đổi range. Nếu data
   sai khớp với DB query trực tiếp → không phải cache, là logic.
