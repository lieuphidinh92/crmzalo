/**
 * use-admin-dashboard — owner/admin home page state.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface AdminHeroKpi {
  monthRevenue: { value: number; previous: number; trend: number; sparkline: number[] };
  ytdRevenue: { value: number; goal: number; percentOfGoal: number; remaining: number };
  agents: { active: number; total: number; ratio: number };
  pipeline: { dealCount: number; totalValue: number };
}

export interface CriticalAlerts {
  vipsAtRisk: {
    count: number;
    top: Array<{
      contactId: string;
      fullName: string | null;
      storeName: string | null;
      lifetimeRevenue: number;
      daysSinceLastOrder: number;
      assignedUser: { id: string; fullName: string } | null;
    }>;
  };
  stuckDeals: {
    count: number;
    top: Array<{
      contactId: string;
      fullName: string | null;
      stage: string;
      daysIdle: number;
      potentialValue: number;
      assignedUser: { id: string; fullName: string } | null;
    }>;
  };
  underperformingSales: {
    count: number;
    items: Array<{ saleId: string; saleName: string; score: number }>;
  };
}

export type RevenueGroupBy = 'total' | 'type' | 'source';

export interface RevenueTrendResponse {
  months: string[];
  series: string[];
  rows: Array<{ month: string; series: Record<string, number> }>;
}

export interface RecentNewAgent {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  closedAt: string;
}

export interface TopSale {
  rank: number;
  saleId: string;
  saleName: string;
  score: number;
  monthRevenue: number;
}

export function useAdminDashboard() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  const heroKpi = ref<AdminHeroKpi | null>(null);
  const alerts = ref<CriticalAlerts | null>(null);
  const revenueTrend = ref<RevenueTrendResponse | null>(null);
  const recentAgents = ref<RecentNewAgent[]>([]);
  const topSales = ref<TopSale[]>([]);

  const groupBy = ref<RevenueGroupBy>('total');
  const trendLoading = ref(false);

  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      const [hero, alertsRes, trend, agents, sales] = await Promise.all([
        api.get('/dashboard/admin/hero-kpi').then((r) => r.data),
        api.get('/dashboard/admin/critical-alerts').then((r) => r.data),
        api
          .get('/dashboard/admin/revenue-trend', {
            params: { groupBy: groupBy.value },
          })
          .then((r) => r.data),
        api.get('/dashboard/admin/recent-new-agents').then((r) => r.data),
        api.get('/dashboard/admin/top-sales').then((r) => r.data),
      ]);
      heroKpi.value = hero;
      alerts.value = alertsRes;
      revenueTrend.value = trend;
      recentAgents.value = agents.agents ?? [];
      topSales.value = sales.sales ?? [];
    } catch (err: any) {
      error.value =
        err?.response?.data?.error ?? 'Lỗi tải tổng quan điều hành';
    } finally {
      loading.value = false;
    }
  }

  async function changeGroupBy(g: RevenueGroupBy) {
    groupBy.value = g;
    trendLoading.value = true;
    try {
      const trend = await api
        .get('/dashboard/admin/revenue-trend', { params: { groupBy: g } })
        .then((r) => r.data);
      revenueTrend.value = trend;
    } finally {
      trendLoading.value = false;
    }
  }

  return {
    loading,
    error,
    heroKpi,
    alerts,
    revenueTrend,
    recentAgents,
    topSales,
    groupBy,
    trendLoading,
    fetchAll,
    changeGroupBy,
  };
}

export function formatVND(n: number | null | undefined): string {
  if (n == null) return '0 đ';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatVNDShort(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return new Intl.NumberFormat('vi-VN').format(n);
}

export function customerTypeLabel(t: string | null): string {
  const map: Record<string, string> = {
    nha_thuoc: 'Nhà thuốc',
    si_online: 'Sỉ online',
    duoc_si: 'Dược sĩ',
    cua_hang_me_be: 'Mẹ bé',
  };
  if (!t) return '';
  return map[t] ?? t;
}
