/**
 * use-business-goals — fetch + update org-level KPIs/thresholds.
 * Module-level cache so multiple components reading goals share state.
 */
import { readonly, ref } from 'vue';
import { api } from '@/api/index';

export interface BusinessGoals {
  stuckDays: number;
  atRiskDays: number;
  churnDays: number;
  annualRevenue: number;
}

const goals = ref<BusinessGoals | null>(null);
const defaults = ref<BusinessGoals | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
let inflight: Promise<BusinessGoals> | null = null;

async function fetchGoals(force = false): Promise<BusinessGoals> {
  if (!force && goals.value) return goals.value;
  if (inflight) return inflight;
  loading.value = true;
  inflight = api
    .get<{ goals: BusinessGoals; defaults: BusinessGoals }>(
      '/settings/business-goals',
    )
    .then((res) => {
      goals.value = res.data.goals;
      defaults.value = res.data.defaults;
      error.value = null;
      return res.data.goals;
    })
    .catch((err) => {
      error.value = err?.response?.data?.error ?? 'Lỗi tải mục tiêu';
      throw err;
    })
    .finally(() => {
      loading.value = false;
      inflight = null;
    });
  return inflight;
}

async function updateGoals(patch: Partial<BusinessGoals>) {
  saving.value = true;
  try {
    const res = await api.put<{ goals: BusinessGoals }>(
      '/settings/business-goals',
      patch,
    );
    goals.value = res.data.goals;
    return res.data.goals;
  } finally {
    saving.value = false;
  }
}

export function useBusinessGoals() {
  return {
    goals: readonly(goals),
    defaults: readonly(defaults),
    loading: readonly(loading),
    saving: readonly(saving),
    error: readonly(error),
    fetchGoals,
    updateGoals,
  };
}
