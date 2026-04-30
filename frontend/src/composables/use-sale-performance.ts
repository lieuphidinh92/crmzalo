/**
 * use-sale-performance — fetch + state for the Sale evaluation module.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export type MetricKey =
  | 'resale_revenue'
  | 'active_rate'
  | 'new_agents'
  | 'conversion_rate'
  | 'retention_90d'
  | 'compliance_score';

export interface ComplianceBreakdown {
  noteFreshness: number;
  stageHygiene: number;
  zaloResponseTime: number;
  aiInsightUsage: number;
  total: number;
}

export interface SaleMetrics {
  saleId: string;
  saleName: string;
  metrics: {
    resaleRevenue: number;
    activeRate: number;
    activeAgents: number;
    totalAgents: number;
    newAgents: number;
    conversionRate: number;
    leadsCount: number;
    convertedCount: number;
    retention90d: number;
    cohort90d: number;
    stillActive90d: number;
    complianceScore: number;
    complianceBreakdown: ComplianceBreakdown;
  };
  normalized: Record<MetricKey, number>;
  overallScore: number;
}

export interface SalePerformanceOverview {
  month: string;
  rows: SaleMetrics[];
  hasEnoughData: boolean;
  weights: Record<MetricKey, number>;
  memberView?: boolean;
}

export interface SaleAlert {
  saleId: string;
  saleName: string;
  reason: string;
  metric: string;
  value: string | number;
}

export interface SaleAlerts {
  needsIntervention: SaleAlert[];
  potential: SaleAlert[];
}

export interface SaleDetail {
  current: SaleMetrics | null;
  history: Array<{ month: string; score: number }>;
  topAgents: Array<{
    contactId: string;
    fullName: string | null;
    storeName: string | null;
    lifetimeRevenue: number;
    daysSinceLastOrder: number | null;
  }>;
  stuckDeals: Array<{
    contactId: string;
    fullName: string | null;
    stage: string;
    daysIdle: number;
  }>;
}

function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function useSalePerformance() {
  const month = ref(defaultMonth());
  const overview = ref<SalePerformanceOverview | null>(null);
  const alerts = ref<SaleAlerts>({ needsIntervention: [], potential: [] });
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchOverview() {
    loading.value = true;
    try {
      const [ovRes, alertsRes] = await Promise.all([
        api.get<SalePerformanceOverview>('/dashboard/ceo/sale-performance', {
          params: { month: month.value },
        }),
        api.get<SaleAlerts>('/dashboard/ceo/sale-performance/alerts', {
          params: { month: month.value },
        }).catch(() => ({ data: { needsIntervention: [], potential: [] } })),
      ]);
      overview.value = ovRes.data;
      alerts.value = alertsRes.data;
      error.value = null;
    } catch (err: any) {
      error.value =
        err?.response?.data?.error ?? 'Lỗi tải hiệu suất sale';
    } finally {
      loading.value = false;
    }
  }

  async function fetchDetail(saleId: string): Promise<SaleDetail> {
    const res = await api.get<SaleDetail>(
      `/dashboard/ceo/sale-performance/${saleId}/detail`,
      { params: { month: month.value } },
    );
    return res.data;
  }

  async function sendFeedback(saleId: string, message: string) {
    await api.post(
      `/dashboard/ceo/sale-performance/${saleId}/feedback`,
      { message },
    );
  }

  return {
    month,
    overview,
    alerts,
    loading,
    error,
    fetchOverview,
    fetchDetail,
    sendFeedback,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────── */

export function formatVNDShort(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return new Intl.NumberFormat('vi-VN').format(n);
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  resale_revenue: 'DS Resale',
  active_rate: 'Tỉ lệ active',
  new_agents: 'Đại lý mới',
  conversion_rate: 'Tỉ lệ chốt',
  retention_90d: 'Retention 90d',
  compliance_score: 'Tuân thủ',
};

export function scoreColor(score: number): string {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}
