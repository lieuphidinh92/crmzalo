/**
 * use-personal-dashboard — fetches the 5 personal-view data sources
 * in parallel. Designed so each widget can also fetch its own slice
 * via the public functions if it ever lives outside the dashboard.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface TodayAppointment {
  id: string;
  contactId: string;
  contactName: string | null;
  customerType: string | null;
  appointmentTime: string | null;
  type: string | null;
  notes: string | null;
  status: string;
}

export interface DueReminder {
  contactId: string;
  contactName: string | null;
  customerType: string | null;
  storeName: string | null;
  phone: string | null;
  nextContactDate: string;
  daysOverdue: number;
  internalNote: string | null;
}

export interface MyAtRiskAgent {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  phone: string | null;
  lifetimeRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
}

export interface PersonalKpi {
  resaleRevenue: {
    value: number;
    previous: number;
    trend: number;
    monthlyTarget: number;
    percentOfTarget: number;
  };
  newClosed: { count: number };
  pipeline: { dealCount: number; totalValue: number };
  complianceScore: { value: number; breakdown: Record<string, number> };
}

export interface MiniPipelineColumn {
  stage: string;
  label: string;
  count: number;
  totalValue: number;
}

export interface QuickActionBadges {
  unreadConversations: number;
}

export function usePersonalDashboard() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  const todayAppointments = ref<TodayAppointment[]>([]);
  const dueReminders = ref<DueReminder[]>([]);
  const myAtRisk = ref<MyAtRiskAgent[]>([]);
  const kpi = ref<PersonalKpi | null>(null);
  const pipeline = ref<MiniPipelineColumn[]>([]);
  const badges = ref<QuickActionBadges>({ unreadConversations: 0 });

  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      const [tasks, atRisk, kpiRes, pipe, bdg] = await Promise.all([
        api.get('/dashboard/personal/today-tasks').then((r) => r.data),
        api.get('/dashboard/personal/at-risk-agents').then((r) => r.data),
        api.get('/dashboard/personal/kpi').then((r) => r.data),
        api.get('/dashboard/personal/mini-pipeline').then((r) => r.data),
        api.get('/dashboard/personal/quick-action-badges').then((r) => r.data),
      ]);
      todayAppointments.value = tasks.appointments ?? [];
      dueReminders.value = tasks.reminders ?? [];
      myAtRisk.value = atRisk.agents ?? [];
      kpi.value = kpiRes;
      pipeline.value = pipe.columns ?? [];
      badges.value = bdg;
    } catch (err: any) {
      error.value =
        err?.response?.data?.error ?? 'Lỗi tải dashboard';
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    todayAppointments,
    dueReminders,
    myAtRisk,
    kpi,
    pipeline,
    badges,
    fetchAll,
  };
}

/* ── Formatters ──────────────────────────────────────────────────── */

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

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Mẹ bé',
};
export function customerTypeLabel(t: string | null): string {
  if (!t) return '';
  return CUSTOMER_TYPE_LABELS[t] ?? t;
}
