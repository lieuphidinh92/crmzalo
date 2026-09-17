import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';

export interface SaleSummary { saleId: string | null; saleName: string; orderCount: number; revenue: number; paid: number; debt: number }
export interface ReportOrder {
  id: string; orderCode: string; orderDate: string | null; createdAt: string; status: string;
  contact: { fullName: string | null; storeName: string | null; phone: string | null } | null;
  assignedSale: { id: string; fullName: string } | null;
  totalAmountValue: number; paidAmount: number; debtAmountValue: number;
  reconciledAt: string | null; vatInvoiceStatus: string; vatIssuedAmount: number;
}
export interface SalesReport {
  rows: ReportOrder[]; total: number; page: number; limit: number;
  summary: { orderCount: number; revenue: number; paid: number; debt: number };
  bySale: SaleSummary[];
  saleOptions: { id: string; fullName: string }[];
}
const vnDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const money = (v: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(v || 0) + ' đ';
export const dateVN = (v: string) => Number.isFinite(new Date(v).getTime()) ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(v)) : 'Ngày không hợp lệ';
export const statusLabels: Record<string, string> = { draft: 'Nháp', new: 'Nháp', confirmed: 'Đã xác nhận', packing: 'Đóng gói', shipping: 'Đang giao', shipped: 'Đang giao', completed: 'Hoàn tất', paid: 'Hoàn tất', cancelled: 'Đã huỷ', returned: 'Đã trả hàng' };
export const vatLabels: Record<string, string> = { not_issued: 'Chưa xuất', requested: 'Chờ xuất', partial: 'Xuất một phần', issued: 'Đã xuất' };

export function useOrderSalesReport() {
  const route = useRoute(); const router = useRouter();
  const today = vnDay();
  const filters = ref({ from: today.slice(0, 7) + '-01', to: today, saleId: '', status: '', search: '', reconciled: '' });
  const page = ref(1); const report = ref<SalesReport | null>(null);
  const loading = ref(false); const error = ref(''); const validation = ref('');
  const applied = ref({ ...filters.value });
  let requestVersion = 0;
  const pageCount = computed(() => Math.max(1, Math.ceil((report.value?.total || 0) / 50)));
  const selectedSale = computed(() => report.value?.saleOptions.find(s => s.id === applied.value.saleId)?.fullName || (applied.value.saleId === 'unassigned' ? 'Chưa gán nhân viên' : 'Tất cả nhân viên'));
  async function fetchReport() {
    const version = ++requestVersion;
    loading.value = true; error.value = ''; report.value = null;
    try {
      const params = Object.fromEntries(Object.entries({ ...applied.value, page: page.value, limit: 50 }).filter(([, value]) => value !== ''));
      const { data } = await api.get<SalesReport>('/reports/order-sales', { params });
      if (version === requestVersion) { report.value = data; page.value = data.page; }
    } catch (e: any) {
      if (version === requestVersion) error.value = e.response?.data?.error || 'Không tải được báo cáo. Anh/chị vui lòng thử lại.';
    } finally { if (version === requestVersion) loading.value = false; }
  }
  function apply(nextPage = 1) {
    validation.value = '';
    if (!filters.value.from || !filters.value.to || filters.value.from > filters.value.to) {
      validation.value = 'Vui lòng chọn khoảng ngày hợp lệ: Từ ngày không được sau Đến ngày.'; return;
    }
    const query: Record<string, string> = { from: filters.value.from, to: filters.value.to, page: String(nextPage) };
    for (const key of ['saleId', 'status', 'search', 'reconciled'] as const) if (filters.value[key]) query[key] = filters.value[key];
    if (JSON.stringify(query) === JSON.stringify(route.query)) { applied.value = { ...filters.value }; page.value = nextPage; void fetchReport(); }
    else void router.replace({ path: '/reports/order-sales', query });
  }
  function selectSale(id: string | null) { filters.value = { ...applied.value, saleId: id || 'unassigned' }; apply(); }
  function allSales() { filters.value = { ...applied.value, saleId: '' }; apply(); }
  function changePage(value: number) { filters.value = { ...applied.value }; apply(value); }
  function preset(key: string) {
    const current = vnDay(); const d = new Date(current + 'T00:00:00Z');
    let from = current; let to = current;
    if (key === 'week') { d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); from = d.toISOString().slice(0, 10); }
    if (key === 'month') from = current.slice(0, 7) + '-01';
    if (key === 'lastMonth') { d.setUTCDate(0); to = d.toISOString().slice(0, 10); from = to.slice(0, 7) + '-01'; }
    if (key === 'quarter') from = current.slice(0, 4) + '-' + String(Math.floor(d.getUTCMonth() / 3) * 3 + 1).padStart(2, '0') + '-01';
    if (key === 'year') from = current.slice(0, 4) + '-01-01';
    filters.value = { ...filters.value, from, to }; apply();
  }
  watch(() => route.fullPath, () => {
    if (route.path !== '/reports/order-sales') return;
    for (const key of Object.keys(filters.value) as (keyof typeof filters.value)[]) {
      const value = route.query[key];
      filters.value[key] = typeof value === 'string' ? value : key === 'from' ? today.slice(0, 7) + '-01' : key === 'to' ? today : '';
    }
    page.value = Math.max(1, Number(route.query.page) || 1);
    applied.value = { ...filters.value }; validation.value = ''; void fetchReport();
  }, { immediate: true });
  return { filters, applied, report, page, pageCount, selectedSale, loading, error, validation, apply, fetchReport, preset, selectSale, allSales, changePage };
}
