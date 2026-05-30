import { ref, computed } from 'vue';
import { api } from '../api/client';

const ROLE_LABEL = {
  owner: 'Chủ doanh nghiệp',
  admin: 'Quản lý',
  member: 'Sale',
};

export function roleLabel(role) {
  return ROLE_LABEL[role] ?? role ?? '—';
}

export function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  const first = parts[0] ?? '';
  if (parts.length === 1) return first.charAt(0).toUpperCase();
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

const PREF_DEFAULTS = {
  sale_app_notif_vibrate: true,
  sale_app_notif_sound: true,
  sale_app_confetti: true,
};

export function getPref(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return PREF_DEFAULTS[key] ?? false;
  return raw === 'true';
}

export function setPref(key, value) {
  localStorage.setItem(key, value ? 'true' : 'false');
}

export function useAccount() {
  const monthKpi = ref(null);
  const ytdKpi = ref(null);
  const goals = ref(null);
  const loadingKpi = ref(false);
  const loadingGoals = ref(false);
  const errorMsg = ref('');

  async function loadMonth() {
    loadingKpi.value = true;
    try {
      const { data } = await api.get('/sale-app/reports/summary', { params: { period: 'this_month' } });
      monthKpi.value = data;
    } catch (err) {
      errorMsg.value = err.response?.data?.error || 'Không tải được KPI tháng';
    } finally {
      loadingKpi.value = false;
    }
  }

  async function loadYtd() {
    try {
      const { data } = await api.get('/sale-app/reports/summary', { params: { period: 'ytd' } });
      ytdKpi.value = data;
    } catch {
      // YTD only feeds the goal progress bar — keep silent so partial UI still renders.
      ytdKpi.value = null;
    }
  }

  async function loadGoals() {
    loadingGoals.value = true;
    try {
      const { data } = await api.get('/settings/business-goals');
      goals.value = data.goals ?? data;
    } catch {
      goals.value = null;
    } finally {
      loadingGoals.value = false;
    }
  }

  async function loadAll() {
    await Promise.all([loadMonth(), loadYtd(), loadGoals()]);
  }

  const monthRevenue = computed(() => monthKpi.value?.kpi?.revenue?.value ?? 0);
  const monthOrders = computed(() => monthKpi.value?.kpi?.order_count?.value ?? 0);
  const monthCustomers = computed(() => monthKpi.value?.kpi?.active_customers?.value ?? 0);
  const monthAov = computed(() => monthKpi.value?.kpi?.avg_order_value?.value ?? 0);
  const monthLabel = computed(() => monthKpi.value?.period?.label ?? 'Tháng này');

  const ytdRevenue = computed(() => ytdKpi.value?.kpi?.revenue?.value ?? 0);
  const annualGoal = computed(() => Number(goals.value?.annualRevenue) || 0);
  const goalProgressPct = computed(() => {
    if (!annualGoal.value) return 0;
    const pct = (ytdRevenue.value / annualGoal.value) * 100;
    return Math.max(0, Math.min(100, pct));
  });

  return {
    monthKpi,
    ytdKpi,
    goals,
    loadingKpi,
    loadingGoals,
    errorMsg,
    loadMonth,
    loadYtd,
    loadGoals,
    loadAll,
    monthRevenue,
    monthOrders,
    monthCustomers,
    monthAov,
    monthLabel,
    ytdRevenue,
    annualGoal,
    goalProgressPct,
  };
}
