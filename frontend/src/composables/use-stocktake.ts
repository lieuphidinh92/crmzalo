/**
 * Composable for Kiểm kho (stocktaking) — Module Kho.
 *
 * Wraps the /inventory/stocktakes endpoints:
 *   - list sessions, open a session (snapshots active lots)
 *   - load a session detail with its per-lot items
 *   - save physical counts (draft), complete (applies adjustments), cancel
 *
 * Mutations are owner/admin-only on the backend.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export const STOCKTAKE_STATUS_OPTIONS = [
  { text: 'Đang kiểm', value: 'counting', color: 'info' },
  { text: 'Đã chốt', value: 'completed', color: 'success' },
  { text: 'Đã huỷ', value: 'cancelled', color: 'error' },
] as const;

export interface StocktakeSession {
  id: string;
  code: string;
  status: 'counting' | 'completed' | 'cancelled';
  periodMonth: string;
  note: string | null;
  itemCount: number;
  countedCount: number;
  varianceQty: number;
  varianceValue: number | string | null;
  createdById: string | null;
  createdByName?: string | null;
  completedById: string | null;
  completedByName?: string | null;
  completedAt: string | null;
  createdAt: string;
  warehouse?: { id: string; name: string } | null;
  items?: StocktakeItem[];
}

export interface StocktakeItem {
  id: string;
  batchId: string;
  productId: string;
  systemQty: number;
  countedQty: number | null;
  variance: number;
  unitCost: number | string | null;
  note: string | null;
  batch?: {
    id: string;
    batchCode: string;
    expiryDate: string | null;
    status: string;
    currentQuantity: number;
    product?: {
      id: string;
      sku: string;
      name: string;
      unit: string | null;
      brand?: { id: string; name: string } | null;
    } | null;
  } | null;
}

export function statusInfo(s: string) {
  return STOCKTAKE_STATUS_OPTIONS.find((o) => o.value === s) ?? STOCKTAKE_STATUS_OPTIONS[0];
}

export function useStocktake() {
  const sessions = ref<StocktakeSession[]>([]);
  const loading = ref(false);
  const saving = ref(false);

  async function fetchSessions() {
    loading.value = true;
    try {
      const res = await api.get('/inventory/stocktakes');
      sessions.value = res.data.sessions ?? [];
    } catch (err) {
      console.error('[stocktake] list error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchSession(id: string): Promise<StocktakeSession | null> {
    try {
      const res = await api.get(`/inventory/stocktakes/${id}`);
      return res.data as StocktakeSession;
    } catch (err) {
      console.error('[stocktake] detail error:', err);
      return null;
    }
  }

  async function createSession(payload: { warehouseId?: string; note?: string } = {}) {
    saving.value = true;
    try {
      const res = await api.post('/inventory/stocktakes', payload);
      return res.data as { id: string; code: string };
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Tạo phiên kiểm kho thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function saveCounts(
    id: string,
    items: Array<{ id: string; countedQty: number | null; note?: string | null }>,
  ) {
    saving.value = true;
    try {
      await api.put(`/inventory/stocktakes/${id}/items`, { items });
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Lưu số đếm thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function completeSession(id: string) {
    saving.value = true;
    try {
      const res = await api.post(`/inventory/stocktakes/${id}/complete`, {});
      return res.data as { ok: boolean; adjusted: number };
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Chốt phiên thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function cancelSession(id: string) {
    saving.value = true;
    try {
      await api.post(`/inventory/stocktakes/${id}/cancel`, {});
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Huỷ phiên thất bại');
    } finally {
      saving.value = false;
    }
  }

  return {
    sessions,
    loading,
    saving,
    fetchSessions,
    fetchSession,
    createSession,
    saveCounts,
    completeSession,
    cancelSession,
  };
}
