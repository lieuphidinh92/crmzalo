/**
 * Composable for the wholesale-order workflow (Session 2A).
 *
 * Extends the original simple-order CRUD with:
 *   - 6-status pipeline (draft → confirmed → packing → shipping → completed)
 *   - cancel-with-reason
 *   - line items / gifts / payment endpoints
 *   - permission-aware filters (member sees own orders only)
 *
 * Also re-exports `ORDER_STATUS_OPTIONS` and `Order` type so older
 * components (OrdersView legacy, OrderStaffTable) keep importing without
 * changes.
 */
import { ref, reactive, computed } from 'vue';
import { api } from '@/api/index';

export const ORDER_STATUS_OPTIONS = [
  { text: 'Nháp', value: 'draft', color: 'blue', icon: 'mdi-file-document-edit-outline' },
  { text: 'Xác nhận', value: 'confirmed', color: 'cyan', icon: 'mdi-check-circle-outline' },
  { text: 'Đóng gói', value: 'packing', color: 'purple', icon: 'mdi-package-variant' },
  { text: 'Đang giao', value: 'shipping', color: 'amber', icon: 'mdi-truck-fast-outline' },
  { text: 'Hoàn tất', value: 'completed', color: 'success', icon: 'mdi-check-all' },
  { text: 'Huỷ', value: 'cancelled', color: 'error', icon: 'mdi-close-circle-outline' },
] as const;

export const ORDER_SOURCE_OPTIONS = [
  { text: 'Facebook', value: 'facebook' },
  { text: 'Zalo', value: 'zalo' },
  { text: 'Giới thiệu', value: 'gioi_thieu' },
  { text: 'Khác', value: 'khac' },
];

export const SHIPPING_METHOD_OPTIONS = [
  { text: 'KH tự lấy tại kho', value: 'pickup_at_warehouse' },
  { text: 'Ship COD', value: 'cod' },
  { text: 'Ship trả trước', value: 'prepaid' },
];

export const SHIPPING_PROVIDER_OPTIONS = [
  { text: 'GHTK', value: 'GHTK' },
  { text: 'GHN', value: 'GHN' },
  { text: 'Viettel Post', value: 'Viettel Post' },
  { text: 'J&T', value: 'J&T' },
  { text: 'Tự ship', value: 'Tự ship' },
  { text: 'Khác', value: 'Khác' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { text: 'Chuyển khoản', value: 'bank_transfer' },
  { text: 'COD', value: 'cod' },
  { text: 'Tiền mặt', value: 'cash' },
  { text: 'Công nợ', value: 'credit' },
];

export type OrderStatus =
  | 'draft' | 'confirmed' | 'packing' | 'shipping' | 'completed' | 'cancelled';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  batchId: string | null;
  priceTierId: string | null;
  sku: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discountValue: number;
  lineTotal: number;
  unitCost: number | string | null;
  lineCost: number | string | null;
  profit: number | string | null;
  product?: { id: string; sku: string; name: string; mainImageUrl: string | null; unit: string | null } | null;
  batch?: { id: string; batchCode: string; expiryDate: string | null; currentQuantity: number } | null;
  tier?: { id: string; tierName: string } | null;
}

export interface OrderGift {
  id: string;
  orderId: string;
  productId: string | null;
  batchId: string | null;
  giftName: string;
  quantity: number;
  note: string | null;
  product?: { id: string; sku: string; name: string; mainImageUrl: string | null } | null;
  batch?: { id: string; batchCode: string } | null;
}

export interface Order {
  id: string;
  orgId?: string;
  contactId: string;
  orderCode: string;
  status: string;
  statusNormalized: OrderStatus;
  orderDate: string | null;
  notes: string | null;
  totalAmount: number; // legacy float — kept for back-compat
  subtotalAmount: number | string | null;
  totalAmountValue: number | string | null;
  paidAmount: number | string;
  debtAmountValue: number | string;
  discountType: string | null;
  discountValue: number | string;
  discountAmount: number | string;
  shippingFee: number | string;
  shippingMethod: string | null;
  shippingProvider: string | null;
  trackingCode: string | null;
  deliveryAddress: string | null;
  paymentMethod: string | null;
  debtDueDate: string | null;
  internalNote: string | null;
  customerNote: string | null;
  source: string | null;
  vatInvoiceStatus: string | null;
  vatInvoiceUrl: string | null;
  cancelReason: string | null;
  assignedSaleId: string | null;
  mktOwnerId: string | null;
  confirmedAt: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string } | null;
  assignedSale?: { id: string; fullName: string; email: string } | null;
  mktOwner?: { id: string; fullName: string; email: string } | null;
  contact?: {
    id: string;
    fullName: string | null;
    phone: string | null;
    storeName: string | null;
    province: string | null;
    address: string | null;
    customerType: string | null;
    policyTier: string | null;
    stage: string | null;
    assignedUserId: string | null;
  } | null;
  items?: OrderItem[];
  gifts?: OrderGift[];
}

export interface PipelineSummary {
  counts: Record<OrderStatus, number>;
  statuses: OrderStatus[];
  warnings: { overdueDebt: number; expiringBatches: number };
}

export interface OrderFilters {
  search: string;
  statuses: OrderStatus[];
  saleId: string | null;
  contactId: string | null;
  from: string;
  to: string;
  hasDebt: '' | '1' | '0';
  overdue: boolean;
}

export function statusInfo(status: string) {
  const s = ORDER_STATUS_OPTIONS.find((o) => o.value === status);
  return s ?? ORDER_STATUS_OPTIONS[0];
}

export function statusLabel(status: string) {
  return statusInfo(status).text;
}

export function statusColor(status: string) {
  return statusInfo(status).color;
}

export function formatVND(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '0 đ';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (Number.isNaN(num)) return '0 đ';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(num);
}

export function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isNaN(n) ? 0 : n;
}

export function isOverdue(order: Pick<Order, 'debtAmountValue' | 'debtDueDate' | 'statusNormalized'>): boolean {
  if (order.statusNormalized === 'cancelled') return false;
  if (toNum(order.debtAmountValue) <= 0) return false;
  if (!order.debtDueDate) return false;
  return new Date(order.debtDueDate) < new Date();
}

export function useOrders() {
  const orders = ref<Order[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  const summary = ref<PipelineSummary | null>(null);

  const filters = reactive<OrderFilters>({
    search: '',
    statuses: [],
    saleId: null,
    contactId: null,
    from: '',
    to: '',
    hasDebt: '',
    overdue: false,
  });
  const pagination = reactive({ page: 1, limit: 50 });

  async function fetchOrders() {
    loading.value = true;
    try {
      const res = await api.get('/orders', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search || undefined,
          status: filters.statuses.length ? filters.statuses.join(',') : undefined,
          saleId: filters.saleId || undefined,
          contactId: filters.contactId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          hasDebt: filters.hasDebt || undefined,
          overdue: filters.overdue ? '1' : undefined,
        },
      });
      orders.value = res.data.orders ?? [];
      total.value = res.data.total ?? 0;
    } catch (err) {
      console.error('[orders] fetch error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchOrder(id: string): Promise<Order | null> {
    try {
      const res = await api.get(`/orders/${id}`);
      return res.data;
    } catch (err) {
      console.error('[orders] fetch detail error:', err);
      return null;
    }
  }

  async function fetchPipelineSummary() {
    try {
      const res = await api.get('/orders/pipeline-summary');
      summary.value = res.data;
    } catch (err) {
      console.error('[orders] summary error:', err);
    }
  }

  async function createOrder(payload: Partial<Order>): Promise<Order> {
    saving.value = true;
    try {
      const res = await api.post('/orders', payload);
      return res.data;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Tạo đơn thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function updateOrder(id: string, payload: Partial<Order>): Promise<Order> {
    saving.value = true;
    try {
      const res = await api.put(`/orders/${id}`, payload);
      return res.data;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Cập nhật đơn thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function deleteOrder(id: string): Promise<boolean> {
    try {
      await api.delete(`/orders/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  async function transitionOrder(id: string, toStatus: OrderStatus, extra: Record<string, unknown> = {}): Promise<Order> {
    const res = await api.post(`/orders/${id}/transition`, { to_status: toStatus, ...extra });
    return res.data;
  }

  async function cancelOrder(id: string, cancelReason: string): Promise<Order> {
    const res = await api.post(`/orders/${id}/cancel`, { cancelReason });
    return res.data;
  }

  // Items
  async function addItem(orderId: string, payload: Record<string, unknown>) {
    const res = await api.post(`/orders/${orderId}/items`, payload);
    return res.data as OrderItem;
  }
  async function updateItem(orderId: string, itemId: string, payload: Record<string, unknown>) {
    const res = await api.put(`/orders/${orderId}/items/${itemId}`, payload);
    return res.data as OrderItem;
  }
  async function deleteItem(orderId: string, itemId: string) {
    await api.delete(`/orders/${orderId}/items/${itemId}`);
  }

  // Gifts
  async function addGift(orderId: string, payload: Record<string, unknown>) {
    const res = await api.post(`/orders/${orderId}/gifts`, payload);
    return res.data as OrderGift;
  }
  async function deleteGift(orderId: string, giftId: string) {
    await api.delete(`/orders/${orderId}/gifts/${giftId}`);
  }

  // Payment
  async function recordPayment(orderId: string, payload: { paidAmount?: number; paymentMethod?: string; debtDueDate?: string | null; mode?: 'add' | 'set' }) {
    const res = await api.post(`/orders/${orderId}/payment`, payload);
    return res.data as Order;
  }

  // Legacy stats — used by use-dashboard.ts
  const stats = ref<{ totalOrders: number; completedOrders: number; totalRevenue: number; todayRevenue: number } | null>(null);
  const staffStats = ref<Array<{ userId: string; fullName: string; orderCount: number; totalRevenue: number }>>([]);

  async function fetchStats() {
    try {
      const res = await api.get('/orders/stats');
      stats.value = res.data;
    } catch (err) {
      console.error('[orders] stats error:', err);
    }
  }
  async function fetchStaffStats() {
    try {
      const res = await api.get('/orders/by-staff');
      staffStats.value = res.data.staffStats ?? [];
    } catch (err) {
      console.error('[orders] staff stats error:', err);
    }
  }

  function resetFilters() {
    filters.search = '';
    filters.statuses = [];
    filters.saleId = null;
    filters.contactId = null;
    filters.from = '';
    filters.to = '';
    filters.hasDebt = '';
    filters.overdue = false;
    pagination.page = 1;
    fetchOrders();
  }

  const hasActiveFilters = computed(
    () =>
      !!filters.search ||
      filters.statuses.length > 0 ||
      !!filters.saleId ||
      !!filters.from ||
      !!filters.to ||
      filters.hasDebt !== '' ||
      filters.overdue,
  );

  return {
    orders,
    total,
    loading,
    saving,
    summary,
    filters,
    pagination,
    hasActiveFilters,
    stats,
    staffStats,
    fetchOrders,
    fetchOrder,
    fetchPipelineSummary,
    createOrder,
    updateOrder,
    deleteOrder,
    transitionOrder,
    cancelOrder,
    addItem,
    updateItem,
    deleteItem,
    addGift,
    deleteGift,
    recordPayment,
    fetchStats,
    fetchStaffStats,
    resetFilters,
    statusLabel,
    statusColor,
  };
}

// Wholesale-order list for a contact (used in ContactDetail "Đơn hàng" tab)
export async function fetchContactWholesaleOrders(contactId: string): Promise<{ orders: Order[]; stats: { totalValue: number; orderCount: number; lastOrderDate: string | null } }> {
  const res = await api.get(`/contacts/${contactId}/wholesale-orders`);
  return res.data;
}
