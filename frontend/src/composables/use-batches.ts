/**
 * Read-only access to inventory batches for the order entry flow
 * (Session 2A). Full CRUD + audit log lives in Session 3.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface Batch {
  id: string;
  productId: string;
  warehouseId: string;
  batchCode: string;
  manufactureDate: string | null;
  expiryDate: string | null;
  importQuantity: number;
  currentQuantity: number;
  status: string;
  warning: 'expired' | 'expiring_soon' | null;
  warehouse?: { id: string; name: string };
}

export function useBatches() {
  const batches = ref<Batch[]>([]);
  const loading = ref(false);

  async function fetchProductBatches(productId: string, opts: { includeEmpty?: boolean } = {}) {
    loading.value = true;
    try {
      const res = await api.get(`/products/${productId}/batches`, {
        params: { includeEmpty: opts.includeEmpty ? '1' : '0' },
      });
      batches.value = res.data.batches ?? [];
      return batches.value;
    } catch (err) {
      console.error('[batches] fetch error:', err);
      batches.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function fetchExpiring(days = 90) {
    try {
      const res = await api.get('/inventory/expiring', { params: { days } });
      return res.data.batches as Array<Batch & { product: { id: string; sku: string; name: string } }>;
    } catch (err) {
      console.error('[batches] expiring error:', err);
      return [];
    }
  }

  return { batches, loading, fetchProductBatches, fetchExpiring };
}

export function formatBatchOption(b: Batch): string {
  const exp = b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }) : 'không HSD';
  return `${b.batchCode} · Còn ${b.currentQuantity} · HSD ${exp}`;
}
