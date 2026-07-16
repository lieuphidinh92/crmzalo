import { ref } from 'vue';
import { api } from '../api/client';
import { formatVND, formatDateVN, formatDateTimeVN } from './useFormat';

/**
 * Imports (phiếu nhập kho) composable — "hợp đồng API" dùng chung cho
 * cả 3 màn: danh sách (ImportsList), chi tiết (ImportDetail), form
 * (ImportForm). Giữ NGUYÊN tên hàm + chữ ký để 3 màn khớp nhau.
 *
 * Backend trả object thô (KHÔNG envelope {success,data}):
 *   - GET  /imports              → { imports: [...] }
 *   - GET  /imports/:id          → { import: {header, items[], batches[]} }
 *   - GET  /warehouses           → { warehouses: [...] }
 *   - GET  /suppliers            → { suppliers: [...] }
 *   - GET  /sale-app/products/search?q= → { products: [...] }
 *   - POST /imports              → { id }
 *   - PUT  /imports/:id          → { ... }
 *   - DELETE /imports/:id        → { ... }
 *   - GET  /imports/:id/warnings → { warnings: [...] }
 *   - POST /imports/:id/confirm  → { ... }
 * Lỗi: HTTP status + { error }.
 *
 * Chỉ owner/admin dùng nhập kho (backend khoá 403 với member).
 */
export function useImports() {
  const list = ref([]);
  const listLoading = ref(false);
  const listError = ref('');

  const detail = ref(null);
  const detailLoading = ref(false);
  const detailError = ref('');

  const warehouses = ref([]);
  const suppliers = ref([]);
  const warnings = ref([]);

  const saving = ref(false);
  const confirming = ref(false);

  async function loadList({ status, supplierId, from, to, page, limit } = {}) {
    listLoading.value = true;
    listError.value = '';
    try {
      const params = {};
      if (status) params.status = status;
      if (supplierId) params.supplierId = supplierId;
      if (from) params.from = from;
      if (to) params.to = to;
      if (page) params.page = page;
      if (limit) params.limit = limit;
      const { data } = await api.get('/imports', { params });
      list.value = data.imports || [];
    } catch (err) {
      listError.value = err.response?.data?.error || 'Không tải được danh sách phiếu nhập';
      list.value = [];
    } finally {
      listLoading.value = false;
    }
  }

  async function loadDetail(id) {
    detailLoading.value = true;
    detailError.value = '';
    try {
      const { data } = await api.get(`/imports/${id}`);
      detail.value = data.import || data;
    } catch (err) {
      detailError.value = err.response?.data?.error || 'Không tải được chi tiết phiếu nhập';
      detail.value = null;
    } finally {
      detailLoading.value = false;
    }
  }

  async function loadWarehouses() {
    try {
      const { data } = await api.get('/warehouses');
      warehouses.value = data.warehouses || data || [];
    } catch {
      warehouses.value = [];
    }
  }

  async function loadSuppliers() {
    try {
      const { data } = await api.get('/suppliers');
      suppliers.value = data.suppliers || data || [];
    } catch {
      suppliers.value = [];
    }
  }

  async function searchProducts(q) {
    try {
      const { data } = await api.get('/sale-app/products/search', { params: { q } });
      return data.products || [];
    } catch {
      return [];
    }
  }

  async function createDraft(payload) {
    saving.value = true;
    try {
      const { data } = await api.post('/imports', payload);
      return data;
    } finally {
      saving.value = false;
    }
  }

  async function updateDraft(id, payload) {
    saving.value = true;
    try {
      const { data } = await api.put(`/imports/${id}`, payload);
      return data;
    } finally {
      saving.value = false;
    }
  }

  async function deleteDraft(id) {
    const { data } = await api.delete(`/imports/${id}`);
    return data;
  }

  async function loadWarnings(id) {
    try {
      const { data } = await api.get(`/imports/${id}/warnings`);
      warnings.value = data.warnings || [];
    } catch {
      warnings.value = [];
    }
    return warnings.value;
  }

  async function confirmImport(id) {
    confirming.value = true;
    try {
      const { data } = await api.post(`/imports/${id}/confirm`);
      return data;
    } finally {
      confirming.value = false;
    }
  }

  // Tạo NCC mới (owner/admin). Trả về object supplier vừa tạo (đã gồm 3 field
  // mới: companyName, representative, representativeTitle). NÉM lỗi để UI hiện.
  async function createSupplier(payload) {
    const { data } = await api.post('/suppliers', payload);
    return data;
  }

  // Công nợ hiện tại của 1 NCC (tổng debt các phiếu nhập đã chốt chưa trả).
  // Route "balance" nhẹ dành riêng cho form nhập hàng (module supplier-debt).
  // Nuốt lỗi → trả null để UI không vỡ.
  async function loadSupplierDebt(id) {
    try {
      const { data } = await api.get(`/supplier-debt/suppliers/${id}/balance`);
      return Number(data?.debt) || 0;
    } catch {
      return null;
    }
  }

  return {
    // state
    list,
    listLoading,
    listError,
    detail,
    detailLoading,
    detailError,
    warehouses,
    suppliers,
    warnings,
    saving,
    confirming,
    // actions
    loadList,
    loadDetail,
    loadWarehouses,
    loadSuppliers,
    searchProducts,
    createDraft,
    updateDraft,
    deleteDraft,
    loadWarnings,
    confirmImport,
    createSupplier,
    loadSupplierDebt,
    // format helpers (tái dùng từ useFormat.js)
    formatVND,
    formatDateVN,
    formatDateTimeVN,
  };
}
