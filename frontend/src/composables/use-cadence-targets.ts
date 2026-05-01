/**
 * use-cadence-targets — admin state for per-role weekly cadence targets.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface CadenceTargetSet {
  posts: number;
  interacts: number;
  learning: number;
  reports: number;
}

export interface CadenceTargets {
  member: CadenceTargetSet;
  admin: CadenceTargetSet;
}

const targets = ref<CadenceTargets | null>(null);
const defaults = ref<CadenceTargets | null>(null);
const loading = ref(false);
const saving = ref(false);

async function fetchTargets() {
  loading.value = true;
  try {
    const res = await api.get<{ targets: CadenceTargets; defaults: CadenceTargets }>(
      '/cadence/targets',
    );
    targets.value = res.data.targets;
    defaults.value = res.data.defaults;
  } finally {
    loading.value = false;
  }
}

async function updateTargets(patch: Partial<CadenceTargets>) {
  saving.value = true;
  try {
    const res = await api.put<{ targets: CadenceTargets }>('/cadence/targets', patch);
    targets.value = res.data.targets;
  } finally {
    saving.value = false;
  }
}

export function useCadenceTargets() {
  return {
    targets,
    defaults,
    loading,
    saving,
    fetchTargets,
    updateTargets,
  };
}
