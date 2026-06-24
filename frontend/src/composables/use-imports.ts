/**
 * Composable for the FIFO import-orders module (Session 3.5C).
 *
 * Wraps the backend at /api/v1/imports — list, detail, create draft,
 * update draft, delete draft, confirm, and parse-excel preview. All
 * endpoints are owner|admin only on the backend; the frontend route
 * meta + sidebar visibility match.
 */
import { ref, reactive, computed } from 'vue';
import { api } from '@/api/index';

export const IMPORT_STATUS_OPTIONS = [
  { text: 'Tất cả', value: '' },
  { text: 'Nháp', value: 'draft', color: 'grey' },
  { text: 'Đã nhập kho', value: 'confirmed', color: 'success' },
] as const;

export interface ImportSupplier {
  id: string;
  name: string;
  country: string | null;
}

export interface ImportWarehouse {
  id: string;
  name: string;
  address?: string | null;
}

export interface ImportLineProduct {
  id: string;
  sku: string;
  name: string;
  unit: string | null;
}

export interface ImportLine {
  id: string;
  importOrderId?: string;
  productId: string;
  batchCode: string;
  quantity: number;
  unitCost: number | string;
  manufactureDate: string | null;
  expiryDate: string | null;
  lineTotal: number | string;
  notes: string | null;
  product?: ImportLineProduct;
}

export interface ImportOrder {
  id: string;
  orgId: string;
  importCode: string;
  supplierId: string | null;
  warehouseId: string | null;
  importDate: string;
  nccInvoiceNo: string | null;
  totalAmount: number | string;
  totalQuantity: number;
  status: 'draft' | 'confirmed';
  notes: string | null;
  // ── Phiếu nhập POS: phí / chiết khấu / VAT / cọc ──
  shippingFee: number | string;
  discountType: 'amount' | 'percent';
  discountValue: number | string;
  discountAmount: number | string;
  vatRate: number;
  vatAmount: number | string;
  grandTotal: number | string;
  depositAmount: number | string;
  attachments: Array<{ name: string; url: string; type?: string }>;
  createdById: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: ImportSupplier | null;
  items?: ImportLine[];
  batches?: Array<{
    id: string;
    batchCode: string;
    productId: string;
    currentQuantity: number;
    status: string;
  }>;
  _count?: { items: number; batches: number };
}

export interface ImportFilters {
  search: string;
  supplierId: string;
  status: string;
  from: string;
  to: string;
}

export interface ParsedExcelRow {
  rowNum: number;
  sku: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitCost: number;
  batchCode: string;
  manufactureDate: string | null;
  expiryDate: string | null;
  notes: string | null;
}

export interface ParsedExcelResponse {
  rows: ParsedExcelRow[];
  errors: Array<{ rowNum: number; message: string }>;
  summary: { totalRows: number; errorRows: number };
}

export interface ImportWarning {
  type: 'cost_above_price' | 'price_jump';
  severity: 'high' | 'medium';
  productId: string;
  sku: string;
  productName: string;
  message: string;
}

/** Suggest a batch code in the format `L{YYMM}-A`. The trailing letter
 * is conservative — admin can edit before save. */
export function suggestBatchCode(date = new Date()): string {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `L${yy}${mm}-A`;
}

export function formatVNDFull(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  return new Intl.NumberFormat('vi-VN').format(v) + ' đ';
}

export function formatVNDCompact(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (!v || !Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + ' tỷ';
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'tr';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(0) + 'k';
  return String(v);
}

export function formatDateVN(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function useImports() {
  const imports = ref<ImportOrder[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const filters = reactive<ImportFilters>({
    search: '',
    supplierId: '',
    status: '',
    from: '',
    to: '',
  });

  const pagination = reactive({ page: 1, limit: 50 });

  /** Suppliers list cached in module scope so the Form + Filter share. */
  const suppliers = ref<ImportSupplier[]>([]);
  let suppliersLoaded = false;

  async function fetchSuppliers(): Promise<ImportSupplier[]> {
    if (suppliersLoaded) return suppliers.value;
    try {
      const { data } = await api.get('/suppliers');
      suppliers.value = data?.suppliers ?? data ?? [];
      suppliersLoaded = true;
    } catch (err) {
      console.error('[imports] failed to load suppliers:', err);
    }
    return suppliers.value;
  }

  /** Warehouses cached (single warehouse hiện tại, nhưng UI cho chọn). */
  const warehouses = ref<ImportWarehouse[]>([]);
  let warehousesLoaded = false;

  async function fetchWarehouses(): Promise<ImportWarehouse[]> {
    if (warehousesLoaded) return warehouses.value;
    try {
      const { data } = await api.get('/warehouses');
      warehouses.value = data?.warehouses ?? [];
      warehousesLoaded = true;
    } catch (err) {
      console.error('[imports] failed to load warehouses:', err);
    }
    return warehouses.value;
  }

  /** Công nợ hiện tại của 1 NCC (cho hiển thị "Công nợ" trên form). */
  async function fetchSupplierBalance(supplierId: string): Promise<number> {
    try {
      const { data } = await api.get(`/supplier-debt/suppliers/${supplierId}/balance`);
      return Number(data?.debt) || 0;
    } catch (err) {
      console.error('[imports] failed to load supplier balance:', err);
      return 0;
    }
  }

  /** Thêm nhanh NCC (nút + cạnh dropdown) — chỉ cần tên. */
  async function createSupplierQuick(name: string): Promise<ImportSupplier | null> {
    try {
      const { data } = await api.post('/suppliers', { name: name.trim() });
      const created: ImportSupplier = { id: data.id, name: data.name, country: data.country ?? null };
      suppliers.value = [created, ...suppliers.value];
      return created;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không thêm được NCC';
      return null;
    }
  }

  async function fetchImports() {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/imports', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search || undefined,
          supplierId: filters.supplierId || undefined,
          status: filters.status || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        },
      });
      imports.value = data.imports ?? [];
      total.value = data.total ?? imports.value.length;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không tải được danh sách đơn nhập';
    } finally {
      loading.value = false;
    }
  }

  async function fetchImport(id: string): Promise<ImportOrder | null> {
    try {
      const { data } = await api.get(`/imports/${id}`);
      return data.import;
    } catch (err: any) {
      console.error('[imports] fetch detail failed:', err);
      return null;
    }
  }

  interface SaveItemPayload {
    productId: string;
    batchCode: string;
    quantity: number;
    unitCost: number;
    manufactureDate?: string | null;
    expiryDate?: string | null;
    notes?: string | null;
  }

  interface SavePayload {
    supplierId?: string | null;
    warehouseId?: string | null;
    importDate?: string | null;
    nccInvoiceNo?: string | null;
    notes?: string | null;
    attachments?: ImportOrder['attachments'];
    items: SaveItemPayload[];
    // ── Phiếu nhập POS ──
    shippingFee?: number | null;
    discountType?: 'amount' | 'percent' | null;
    discountValue?: number | null;
    vatRate?: number | null;
    depositAmount?: number | null;
  }

  async function createImport(payload: SavePayload): Promise<ImportOrder | null> {
    saving.value = true;
    error.value = null;
    try {
      const { data } = await api.post('/imports', payload);
      return data.import;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không tạo được đơn nhập';
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateImport(
    id: string,
    payload: SavePayload,
  ): Promise<ImportOrder | null> {
    saving.value = true;
    error.value = null;
    try {
      const { data } = await api.put(`/imports/${id}`, payload);
      return data.import;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không cập nhật được đơn nhập';
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteImport(id: string): Promise<boolean> {
    try {
      await api.delete(`/imports/${id}`);
      return true;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không xoá được đơn nhập';
      return false;
    }
  }

  async function confirmImport(id: string): Promise<{ ok: boolean; batchesCreated?: number } | null> {
    saving.value = true;
    error.value = null;
    try {
      const { data } = await api.post(`/imports/${id}/confirm`);
      return data;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không xác nhận được đơn nhập';
      return null;
    } finally {
      saving.value = false;
    }
  }

  /** Pre-confirm sanity check — backend computes 2 soft warnings
   * (cost > min price, price-jump >20% vs avg of last 3 imports). Empty
   * array = OK to confirm without prompting. */
  async function fetchWarnings(id: string): Promise<ImportWarning[]> {
    try {
      const { data } = await api.get<{ warnings: ImportWarning[] }>(
        `/imports/${id}/warnings`,
      );
      return data.warnings ?? [];
    } catch (err) {
      console.error('[imports] warnings fetch failed:', err);
      return [];
    }
  }

  /** Upload `.xlsx` and receive parsed rows + per-row errors. The
   * caller renders a preview table; rows are accepted only when the
   * user clicks "Đưa vào form". */
  async function parseExcel(file: File): Promise<ParsedExcelResponse | null> {
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post<ParsedExcelResponse>(
        '/imports/parse-excel',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không đọc được file Excel';
      return null;
    }
  }

  // ── Stats derived client-side from the loaded list (avoids extra API).
  // The header card shows: this-month sum, draft count, top supplier YTD.
  const stats = computed(() => {
    const list = imports.value;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    let monthAmount = 0;
    let draftCount = 0;
    const ytdBySupplier = new Map<string, { name: string; total: number }>();
    for (const o of list) {
      const date = new Date(o.importDate);
      const amount = Number(o.totalAmount) || 0;
      if (o.status === 'confirmed' && date >= monthStart) monthAmount += amount;
      if (o.status === 'draft') draftCount++;
      if (o.status === 'confirmed' && date >= yearStart && o.supplier) {
        const cur = ytdBySupplier.get(o.supplier.id) ?? {
          name: o.supplier.name,
          total: 0,
        };
        cur.total += amount;
        ytdBySupplier.set(o.supplier.id, cur);
      }
    }
    let topSupplier: { name: string; total: number } | null = null;
    for (const v of ytdBySupplier.values()) {
      if (!topSupplier || v.total > topSupplier.total) topSupplier = v;
    }
    return {
      monthAmount,
      draftCount,
      totalCount: list.length,
      topSupplier,
    };
  });

  return {
    imports,
    total,
    loading,
    saving,
    error,
    filters,
    pagination,
    suppliers,
    warehouses,
    stats,
    fetchSuppliers,
    fetchWarehouses,
    fetchSupplierBalance,
    createSupplierQuick,
    fetchImports,
    fetchImport,
    createImport,
    updateImport,
    deleteImport,
    confirmImport,
    parseExcel,
    fetchWarnings,
  };
}
