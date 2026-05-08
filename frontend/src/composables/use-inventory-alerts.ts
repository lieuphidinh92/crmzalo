/**
 * Inventory alerts banner data (Session 3.5D-2).
 *
 * Wraps `GET /api/v1/inventory/alerts`. The banner is a fire-and-
 * forget read on Dashboard + InventoryView mount; we never auto-
 * poll because the backend cron only flips state once a day, and
 * stock changes already trigger explicit reloads where they matter
 * (e.g. order packing → user is on order page, not dashboard).
 */
import { computed, ref } from 'vue';
import { api } from '@/api/index';

export interface LowStockAlert {
  productId: string;
  sku: string;
  name: string;
  totalStock: number;
  warningStock: number;
  unit: string | null;
}

export interface BatchAlert {
  batchId: string;
  batchCode: string;
  productId: string;
  productSku: string;
  productName: string;
  expiryDate: string | null;
  currentQuantity: number;
  daysLeft: number;
}

export interface AlertsResponse {
  lowStock: LowStockAlert[];
  expiringIn90: BatchAlert[];
  expired: BatchAlert[];
  summary: {
    lowStockCount: number;
    expiringCount: number;
    expiredCount: number;
    totalCount: number;
  };
}

export function useInventoryAlerts() {
  const data = ref<AlertsResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchAlerts() {
    loading.value = true;
    error.value = null;
    try {
      const { data: res } = await api.get<AlertsResponse>('/inventory/alerts');
      data.value = res;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không tải được cảnh báo kho';
    } finally {
      loading.value = false;
    }
  }

  /** True when at least one of the 3 buckets has rows. Lets the
   * banner self-hide instead of pinning an empty card to the page. */
  const hasAlerts = computed(() => {
    if (!data.value) return false;
    return data.value.summary.totalCount > 0;
  });

  return { data, loading, error, hasAlerts, fetchAlerts };
}
