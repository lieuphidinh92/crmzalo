/**
 * use-ceo-dashboard — fetch + state for the CEO dashboard.
 * Server caches each panel for 15 minutes; client just calls fetchAll
 * once on page mount and offers a manual Refresh button.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface CeoKpi {
  monthRevenue: { value: number; previous: number; trend: number };
  ytdRevenue: { value: number; goal: number; percentOfGoal: number };
  agents: { active: number; total: number; ratio: number };
  newClosed: { count: number; previous: number; trend: number };
  churned: { count: number; ratio: number; alert: boolean };
  pipelineValue: number;
}

export interface ParetoRow {
  rank: number;
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  ytdRevenue: number;
  contributionPercent: number;
  cumulativePercent: number;
  health: 'active' | 'at_risk' | 'churned' | 'unknown';
  daysSinceLastOrder: number | null;
}

export interface ParetoResponse {
  rows: ParetoRow[];
  agentsFor80Percent: number;
  totalYtd: number;
}

export interface CohortCell {
  cohortMonth: string;
  monthOffset: number;
  retainedCount: number;
  cohortSize: number;
  retentionPercent: number; // -1 = future / not observable
}

export interface SegmentMonthRow {
  month: string;
  byType: Record<string, number>;
}

export interface AtRiskVip {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  lifetimeRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
}

export function useCeoDashboard() {
  const kpi = ref<CeoKpi | null>(null);
  const pareto = ref<ParetoResponse | null>(null);
  const cohort = ref<{ cohorts: CohortCell[][]; cohortLabels: string[] } | null>(null);
  const segments = ref<SegmentMonthRow[]>([]);
  const vips = ref<AtRiskVip[]>([]);

  const loading = ref(false);
  const error = ref<string | null>(null);
  const notifying = ref<string | null>(null); // contactId currently being notified

  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      // Sale performance is now its own self-fetching section
      // (SalePerformanceSection.vue) — no longer pulled here.
      const [k, p, c, s, v] = await Promise.all([
        api.get('/dashboard/ceo/kpi').then((r) => r.data),
        api.get('/dashboard/ceo/pareto').then((r) => r.data),
        api.get('/dashboard/ceo/cohort-retention').then((r) => r.data),
        api.get('/dashboard/ceo/revenue-by-segment').then((r) => r.data),
        api.get('/dashboard/ceo/at-risk-vips').then((r) => r.data),
      ]);
      kpi.value = k;
      pareto.value = p;
      cohort.value = c;
      segments.value = s.months ?? [];
      vips.value = v.vips ?? [];
    } catch (err: any) {
      error.value =
        err?.response?.status === 403
          ? 'Bạn không có quyền truy cập Dashboard CEO (chỉ admin/owner)'
          : err?.response?.data?.error ?? 'Lỗi tải dashboard';
    } finally {
      loading.value = false;
    }
  }

  async function notifySale(contactId: string, saleUserId: string, message?: string) {
    notifying.value = contactId;
    try {
      await api.post('/dashboard/ceo/notify-sale', {
        contactId,
        saleUserId,
        message,
      });
    } finally {
      notifying.value = null;
    }
  }

  return {
    kpi,
    pareto,
    cohort,
    segments,
    vips,
    loading,
    error,
    notifying,
    fetchAll,
    notifySale,
  };
}

/* ── Formatters ─────────────────────────────────────────────────── */

export function formatVNDFull(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(n);
}

export function formatVNDShort(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return new Intl.NumberFormat('vi-VN').format(n);
}

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Mẹ bé',
};

export function customerTypeLabel(t: string | null): string {
  if (!t) return '—';
  return CUSTOMER_TYPE_LABELS[t] ?? t;
}

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  nha_thuoc: '#F59E0B',
  si_online: '#3B82F6',
  duoc_si: '#10B981',
  cua_hang_me_be: '#EF4444',
  unknown: '#7A8AA0',
};
