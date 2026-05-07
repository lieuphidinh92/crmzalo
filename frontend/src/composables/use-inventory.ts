/**
 * Composable for the wholesale-inventory module (Session 3).
 *
 * Wraps:
 *   - List & detail of batches (with rich filters)
 *   - Create / update metadata / adjust / recall (admin-only on backend)
 *   - Inventory movements audit log
 *   - Aggregate reports (summary KPIs, by-brand, low-stock)
 */
import { ref, reactive, computed } from 'vue';
import { api } from '@/api/index';

export const BATCH_STATUS_OPTIONS = [
  { text: 'Còn bán', value: 'active', color: 'success' },
  { text: 'Đã hết hạn', value: 'expired', color: 'warning' },
  { text: 'Thu hồi', value: 'recalled', color: 'error' },
] as const;

export const EXPIRY_WINDOW_OPTIONS = [
  { text: 'Đã hết hạn', value: 'expired' },
  { text: 'Trong 30 ngày', value: '30' },
  { text: 'Trong 60 ngày', value: '60' },
  { text: 'Trong 90 ngày', value: '90' },
] as const;

export const MOVEMENT_TYPE_OPTIONS = [
  { text: 'Nhập', value: 'import', color: 'success', icon: 'mdi-arrow-down-bold' },
  { text: 'Xuất (đơn)', value: 'export', color: 'info', icon: 'mdi-arrow-up-bold' },
  { text: 'Hoàn (huỷ đơn)', value: 'return', color: 'warning', icon: 'mdi-restore' },
  { text: 'Điều chỉnh', value: 'adjust', color: 'amber', icon: 'mdi-tune' },
] as const;

export interface Batch {
  id: string;
  orgId: string;
  productId: string;
  warehouseId: string;
  batchCode: string;
  manufactureDate: string | null;
  expiryDate: string | null;
  importQuantity: number;
  currentQuantity: number;
  importCost: number | string | null;
  status: 'active' | 'expired' | 'recalled';
  importedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  warning: 'expired' | 'expiring_30' | 'expiring_60' | 'expiring_90' | null;
  product?: {
    id: string;
    sku: string;
    name: string;
    unit: string | null;
    brandId: string | null;
    brand?: { id: string; name: string } | null;
  } | null;
  warehouse?: { id: string; name: string } | null;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  batchId: string;
  type: 'import' | 'export' | 'adjust' | 'return';
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdById: string | null;
  createdByName?: string | null;
  createdAt: string;
  batch?: { id: string; batchCode: string; productId: string } | null;
  product?: { id: string; sku: string; name: string } | null;
  order?: { id: string; orderCode: string } | null;
}

export interface BatchFilters {
  search: string;
  brandIds: string[];
  productId: string | null;
  statuses: Batch['status'][];
  expiryWindow: '' | 'expired' | '30' | '60' | '90';
}

export interface InventorySummary {
  skuTotal: number;
  skuOutOfStock: number;
  batchActive: number;
  expiringSoon: number;
  stockValue: number;
}

export interface BrandInventory {
  brandId: string;
  brandName: string;
  productCount: number;
  batchCount: number;
  totalQuantity: number;
  stockValue: number;
  expiringCount: number;
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

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

export function expiryBadgeColor(warning: Batch['warning']): string {
  switch (warning) {
    case 'expired':
      return 'error';
    case 'expiring_30':
      return 'error';
    case 'expiring_60':
      return 'warning';
    case 'expiring_90':
      return 'amber';
    default:
      return 'success';
  }
}

export function expiryBadgeLabel(b: Pick<Batch, 'warning' | 'expiryDate'>): string {
  if (!b.expiryDate) return 'Không HSD';
  if (!b.warning) return 'Còn hạn';
  if (b.warning === 'expired') return 'Đã hết hạn';
  if (b.warning === 'expiring_30') return '< 30 ngày';
  if (b.warning === 'expiring_60') return '< 60 ngày';
  if (b.warning === 'expiring_90') return '< 90 ngày';
  return 'Còn hạn';
}

export function movementTypeInfo(type: string) {
  return MOVEMENT_TYPE_OPTIONS.find((m) => m.value === type) ?? MOVEMENT_TYPE_OPTIONS[3];
}

export function useInventory() {
  const batches = ref<Batch[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  const summary = ref<InventorySummary | null>(null);
  const byBrand = ref<BrandInventory[]>([]);
  const lowStock = ref<any[]>([]);

  const filters = reactive<BatchFilters>({
    search: '',
    brandIds: [],
    productId: null,
    statuses: [],
    expiryWindow: '',
  });
  const pagination = reactive({ page: 1, limit: 50 });

  async function fetchBatches() {
    loading.value = true;
    try {
      const res = await api.get('/inventory/batches', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search || undefined,
          brandId: filters.brandIds.length ? filters.brandIds.join(',') : undefined,
          productId: filters.productId || undefined,
          status: filters.statuses.length ? filters.statuses.join(',') : undefined,
          expiryWindow: filters.expiryWindow || undefined,
        },
      });
      batches.value = res.data.batches ?? [];
      total.value = res.data.total ?? 0;
    } catch (err) {
      console.error('[inventory] fetch error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchBatch(id: string): Promise<Batch | null> {
    try {
      const res = await api.get(`/inventory/batches/${id}`);
      return res.data;
    } catch (err) {
      return null;
    }
  }

  async function createBatch(payload: Partial<Batch> & { importQuantity: number; productId: string; batchCode: string }) {
    saving.value = true;
    try {
      const res = await api.post('/inventory/batches', payload);
      return res.data as Batch;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Tạo lô thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function updateBatchMeta(id: string, payload: Partial<Pick<Batch, 'batchCode' | 'manufactureDate' | 'expiryDate' | 'notes'>>) {
    saving.value = true;
    try {
      const res = await api.put(`/inventory/batches/${id}`, payload);
      return res.data as Batch;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Cập nhật lô thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function adjustBatch(id: string, delta: number, reason: string) {
    saving.value = true;
    try {
      const res = await api.post(`/inventory/batches/${id}/adjust`, { delta, reason });
      return res.data as Batch;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Điều chỉnh thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function recallBatch(id: string, reason: string) {
    saving.value = true;
    try {
      const res = await api.post(`/inventory/batches/${id}/recall`, { reason });
      return res.data as Batch;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Thu hồi thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function fetchMovements(params: {
    productId?: string;
    batchId?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const res = await api.get('/inventory/movements', { params });
    return res.data as { movements: InventoryMovement[]; total: number; page: number; limit: number };
  }

  async function fetchSummary() {
    try {
      const res = await api.get('/inventory/summary');
      summary.value = res.data;
    } catch (err) {
      console.error('[inventory] summary error:', err);
    }
  }

  async function fetchByBrand() {
    try {
      const res = await api.get('/inventory/by-brand');
      byBrand.value = res.data.brands ?? [];
    } catch (err) {
      console.error('[inventory] by-brand error:', err);
    }
  }

  async function fetchLowStock() {
    try {
      const res = await api.get('/inventory/low-stock');
      lowStock.value = res.data.products ?? [];
    } catch (err) {
      console.error('[inventory] low-stock error:', err);
    }
  }

  function resetFilters() {
    filters.search = '';
    filters.brandIds = [];
    filters.productId = null;
    filters.statuses = [];
    filters.expiryWindow = '';
    pagination.page = 1;
    fetchBatches();
  }

  const hasActiveFilters = computed(
    () =>
      !!filters.search ||
      filters.brandIds.length > 0 ||
      !!filters.productId ||
      filters.statuses.length > 0 ||
      !!filters.expiryWindow,
  );

  return {
    batches,
    total,
    loading,
    saving,
    summary,
    byBrand,
    lowStock,
    filters,
    pagination,
    hasActiveFilters,
    fetchBatches,
    fetchBatch,
    createBatch,
    updateBatchMeta,
    adjustBatch,
    recallBatch,
    fetchMovements,
    fetchSummary,
    fetchByBrand,
    fetchLowStock,
    resetFilters,
  };
}
