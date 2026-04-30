/**
 * use-resale-report — fetch + state for the resale-effectiveness report.
 *
 * Server already caches 5min so this composable doesn't dedupe further;
 * callers can call refresh() freely after they update filters.
 */
import { reactive, ref } from 'vue';
import { api } from '@/api/index';

export interface ResaleFilters {
  from: string; // 'YYYY-MM-DD'
  to: string;
  saleId: string | null; // assignedUserId
  type: string | null;   // customerType
}

export interface OverviewResponse {
  activeAgents: { count: number; total: number; percent: number; trend: number };
  atRiskAgents: { count: number };
  churnedAgents: { count: number };
  monthRevenue: { value: number; orderCount: number };
  avgOrderInterval: { days: number };
  avgOrderValue: { value: number };
  weeklyRevenue: Array<{ weekStart: string; revenue: number }>;
  typeShare: Array<{ customerType: string | null; revenue: number }>;
}

export interface SegmentRow {
  key: string;
  label: string;
  min: number;
  max: number | null;
  count: number;
  potentialValue: number;
}

export interface TopAgent {
  contactId: string;
  fullName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  orderCount: number;
  totalRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
}

export interface AtRiskAgent {
  contactId: string;
  fullName: string | null;
  phone: string | null;
  customerType: string | null;
  storeName: string | null;
  assignedUser: { id: string; fullName: string } | null;
  orderCount: number;
  totalRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
  segmentKey: string;
  segmentLabel: string;
}

function defaultFilters(): ResaleFilters {
  const today = new Date();
  const prior = new Date(today);
  prior.setDate(prior.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(prior), to: fmt(today), saleId: null, type: null };
}

export function useResaleReport() {
  const filters = reactive<ResaleFilters>(defaultFilters());

  const overview = ref<OverviewResponse | null>(null);
  const segments = ref<SegmentRow[]>([]);
  const topAgents = ref<TopAgent[]>([]);

  const loadingOverview = ref(false);
  const loadingSegments = ref(false);
  const loadingTop = ref(false);
  const error = ref<string | null>(null);

  function buildParams() {
    return {
      from: filters.from || undefined,
      to: filters.to || undefined,
      sale_id: filters.saleId || undefined,
      type: filters.type || undefined,
    };
  }

  async function fetchOverview() {
    loadingOverview.value = true;
    try {
      const res = await api.get('/reports/resale/overview', {
        params: buildParams(),
      });
      overview.value = res.data;
      error.value = null;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Lỗi tải báo cáo';
    } finally {
      loadingOverview.value = false;
    }
  }

  async function fetchSegments() {
    loadingSegments.value = true;
    try {
      const res = await api.get('/reports/resale/segments', {
        params: buildParams(),
      });
      segments.value = res.data.segments ?? [];
    } finally {
      loadingSegments.value = false;
    }
  }

  async function fetchTopAgents(limit = 10) {
    loadingTop.value = true;
    try {
      const res = await api.get('/reports/resale/top-agents', {
        params: { ...buildParams(), limit },
      });
      topAgents.value = res.data.topAgents ?? [];
    } finally {
      loadingTop.value = false;
    }
  }

  async function fetchAll() {
    await Promise.all([fetchOverview(), fetchSegments(), fetchTopAgents()]);
  }

  async function fetchAtRisk(segmentKey?: string): Promise<AtRiskAgent[]> {
    const res = await api.get('/reports/resale/at-risk-agents', {
      params: { ...buildParams(), segment: segmentKey || undefined },
    });
    return res.data.agents ?? [];
  }

  return {
    filters,
    overview,
    segments,
    topAgents,
    loadingOverview,
    loadingSegments,
    loadingTop,
    error,
    fetchOverview,
    fetchSegments,
    fetchTopAgents,
    fetchAll,
    fetchAtRisk,
  };
}

/* ── Formatting helpers shared across components ─────────────────────── */

export function formatVND(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
  return new Intl.NumberFormat('vi-VN').format(n);
}

export function formatVNDFull(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN');
}
