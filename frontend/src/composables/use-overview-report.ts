/**
 * use-overview-report — state + fetching for /reports/overview.
 *
 * Filter ranges are pill-based; "custom" shows the date-range inputs.
 * Last-used range persists in localStorage so a sale's view survives
 * navigation and refresh.
 */
import { computed, reactive, ref, watch } from 'vue';
import { api } from '@/api/index';

const STORAGE_KEY = 'overview.filter.v1';

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface OverviewFilters {
  preset: RangePreset;
  from: string; // YYYY-MM-DD
  to: string;
  saleId: string | null;
}

export interface KpiResponse {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  cards: {
    totalRevenue: { value: number; previous: number; trendPercent: number | null };
    resaleRevenue: {
      value: number;
      previous: number;
      trendPercent: number | null;
      ratioOfTotal: number;
    };
    activeAgents: {
      active: number;
      total: number;
      rate: number;
      previousActive: number;
      delta: number;
    };
    profit: {
      value: number;
      previous: number;
      trendPercent: number | null;
      marginPercent: number;
      costCoveragePercent: number;
    };
  };
}

export interface TopProductRow {
  rank: number;
  sku: string;
  productName: string;
  unit: string | null;
  brand: 'Manhae' | 'Bioisland' | 'Neubria' | 'Khác';
  quantity: number;
  revenue: number;
  profit: number;
  profitMarginPercent: number | null;
  costCoveragePercent: number;
}

export interface TopCustomerRow {
  rank: number;
  contactId: string;
  fullName: string;
  province: string | null;
  phone: string | null;
  zaloUid?: string | null;
  revenue?: number;
  profit?: number;
  orderCount?: number;
  lifetimeRevenue?: number;
  daysInactive?: number | null;
  atRisk: boolean;
}

/* ── Range helpers ─────────────────────────────────────────────────── */

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Convert a preset to a concrete YYYY-MM-DD range. */
export function rangeForPreset(p: RangePreset): { from: string; to: string } {
  const now = new Date();
  if (p === 'today') {
    const t = ymd(now);
    return { from: t, to: t };
  }
  if (p === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const s = ymd(y);
    return { from: s, to: s };
  }
  if (p === 'this_week') {
    // Vietnamese week: Mon → Sun
    const dow = (now.getDay() + 6) % 7; // Mon=0
    const start = new Date(now);
    start.setDate(start.getDate() - dow);
    return { from: ymd(start), to: ymd(now) };
  }
  if (p === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ymd(start), to: ymd(end) };
  }
  if (p === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(start), to: ymd(end) };
  }
  // custom — caller fills from/to manually
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: ymd(start), to: ymd(now) };
}

export function presetLabel(p: RangePreset): string {
  return {
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
    this_week: 'Tuần này',
    this_month: 'Tháng này',
    last_month: 'Tháng trước',
    custom: 'Tuỳ chọn',
  }[p];
}

/** Format a single date string ("2026-05-31") as "31/05/2026". */
export function formatDateVN(s: string): string {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/* ── Format helpers (single source of truth for this page) ────────── */

/** Format VND in compact form: 1.2 tỷ / 600.1tr / 250k / 0. */
export function formatVNDShort(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v === 0) return '0';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}tr`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
  return `${sign}${abs}`;
}

export function formatVNDFull(n: number | null | undefined): string {
  return new Intl.NumberFormat('vi-VN').format(Number(n ?? 0)) + ' đ';
}

export function trendColor(pct: number | null): 'success' | 'error' | 'grey' {
  if (pct === null) return 'grey';
  if (pct > 0.5) return 'success';
  if (pct < -0.5) return 'error';
  return 'grey';
}

export function trendIcon(pct: number | null): string {
  if (pct === null) return 'mdi-minus';
  if (pct > 0.5) return 'mdi-trending-up';
  if (pct < -0.5) return 'mdi-trending-down';
  return 'mdi-minus';
}

/* ── Composable ───────────────────────────────────────────────────── */

function loadInitialFilters(): OverviewFilters {
  if (typeof window === 'undefined') {
    const r = rangeForPreset('this_month');
    return { preset: 'this_month', ...r, saleId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OverviewFilters>;
      if (parsed.preset && parsed.from && parsed.to) {
        return {
          preset: parsed.preset as RangePreset,
          from: parsed.from,
          to: parsed.to,
          saleId: parsed.saleId ?? null,
        };
      }
    }
  } catch {
    // ignore corrupt storage
  }
  const r = rangeForPreset('this_month');
  return { preset: 'this_month', ...r, saleId: null };
}

export function useOverviewReport() {
  const filters = reactive<OverviewFilters>(loadInitialFilters());

  const kpi = ref<KpiResponse | null>(null);
  const topProducts = ref<TopProductRow[]>([]);
  const topCustomers = ref<TopCustomerRow[]>([]);
  const topCustomerType = ref<'revenue' | 'resale' | 'profit' | 'at_risk'>('revenue');

  const loadingKpi = ref(false);
  const loadingProducts = ref(false);
  const loadingCustomers = ref(false);

  const error = ref<string | null>(null);

  const queryString = computed(() => {
    const params = new URLSearchParams();
    params.set('from', filters.from);
    params.set('to', filters.to);
    if (filters.saleId) params.set('sale_id', filters.saleId);
    return params.toString();
  });

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // quota / private browsing — silent
    }
  }

  function setPreset(p: RangePreset) {
    filters.preset = p;
    if (p !== 'custom') {
      const r = rangeForPreset(p);
      filters.from = r.from;
      filters.to = r.to;
    }
    persist();
  }

  function setCustomRange(from: string, to: string) {
    filters.preset = 'custom';
    filters.from = from;
    filters.to = to;
    persist();
  }

  async function fetchKpi() {
    loadingKpi.value = true;
    try {
      const { data } = await api.get<KpiResponse>(
        `/reports/overview/kpi?${queryString.value}`,
      );
      kpi.value = data;
    } catch (e: unknown) {
      error.value = (e as Error)?.message ?? 'Lỗi tải KPI';
    } finally {
      loadingKpi.value = false;
    }
  }

  async function fetchTopProducts() {
    loadingProducts.value = true;
    try {
      const { data } = await api.get<{ products: TopProductRow[] }>(
        `/reports/overview/top-products?${queryString.value}&limit=5`,
      );
      topProducts.value = data.products;
    } catch (e: unknown) {
      error.value = (e as Error)?.message ?? 'Lỗi tải top sản phẩm';
    } finally {
      loadingProducts.value = false;
    }
  }

  async function fetchTopCustomers(type = topCustomerType.value) {
    loadingCustomers.value = true;
    topCustomerType.value = type;
    try {
      const { data } = await api.get<{
        type: typeof topCustomerType.value;
        customers: TopCustomerRow[];
      }>(
        `/reports/overview/top-customers?${queryString.value}&type=${type}&limit=5`,
      );
      topCustomers.value = data.customers;
    } catch (e: unknown) {
      error.value = (e as Error)?.message ?? 'Lỗi tải top khách hàng';
    } finally {
      loadingCustomers.value = false;
    }
  }

  async function refreshAll() {
    error.value = null;
    await Promise.all([fetchKpi(), fetchTopProducts(), fetchTopCustomers()]);
  }

  // Auto-refetch on filter change (debounce-less; cache on backend dedup).
  watch(
    () => `${filters.from}|${filters.to}|${filters.saleId ?? ''}`,
    () => {
      void refreshAll();
    },
    { immediate: true },
  );

  return {
    filters,
    kpi,
    topProducts,
    topCustomers,
    topCustomerType,
    loadingKpi,
    loadingProducts,
    loadingCustomers,
    anyLoading: computed(
      () => loadingKpi.value || loadingProducts.value || loadingCustomers.value,
    ),
    error,
    setPreset,
    setCustomRange,
    fetchTopCustomers,
    refreshAll,
  };
}
