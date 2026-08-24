/**
 * Phạm vi DANH BẠ KHÁCH HÀNG mà một user được phép chạm tới.
 *
 * Vì sao có file này (bug phát hiện 24/8/2026):
 *   `GET /api/v1/contacts` chỉ lọc `orgId` — bất kỳ ai đăng nhập CRM cũng đọc
 *   được khách của CẢ công ty. Endpoint `/contacts/export` thì đã lọc đúng
 *   (`role === 'member'` → chỉ KH của mình) kèm ghi chú "frontend ẩn KH khác" —
 *   nhưng frontend KHÔNG hề ẩn. Tức chính sách đã chốt là "member chỉ thấy KH
 *   của mình", chỉ là list/detail/pipeline quên chưa áp.
 *
 * Cùng tinh thần với `orderScopeWhere` (modules/orders/order-service.ts): lọc ở
 * BACKEND, không tin frontend.
 *
 * ⚠️ Khác `canSeeAllOrders`: ở đây KHÔNG nới theo cờ `canViewAllOrders`. Cờ đó
 * anh Philip chốt 4/8/2026 chỉ để mở phạm vi ĐƠN HÀNG cho nhân sự vận hành
 * (Huy giao hàng, Hiền đối soát) — thông tin KH họ cần đã nằm sẵn trong đơn
 * (order response có include `contact`). Muốn mở luôn cả danh bạ thì sửa 1 dòng
 * ở `canSeeAllContacts` — nhưng phải anh Philip duyệt.
 */

type ScopeUser = { id: string; orgId: string; role: string };

/** Owner/admin thấy toàn bộ danh bạ của org. Member chỉ thấy KH được giao. */
export function canSeeAllContacts(user: { role: string }): boolean {
  return user.role === 'owner' || user.role === 'admin';
}

/**
 * Ép phạm vi lên một object `where` đã build xong.
 *
 * PHẢI gọi SAU khi đã gán hết filter từ query — vì các route có dòng
 * `if (assignedUserId) where.assignedUserId = assignedUserId` lấy thẳng từ query:
 * gọi trước thì member chỉ cần truyền `?assignedUserId=<id người khác>` là ghi đè
 * được phạm vi và đọc/xuất được KH của người khác.
 */
export function applyContactScope<T extends Record<string, any>>(where: T, user: ScopeUser): T {
  if (!canSeeAllContacts(user)) {
    (where as Record<string, any>).assignedUserId = user.id;
  }
  return where;
}

/** `where` gọn cho các query 1 dòng (detail / update / delete). */
export function contactScopeWhere(user: ScopeUser): { orgId: string; assignedUserId?: string } {
  return applyContactScope({ orgId: user.orgId }, user);
}
