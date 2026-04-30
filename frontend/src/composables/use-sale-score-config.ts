/**
 * use-sale-score-config — read/update tunable weights for sale-score formula.
 */
import { ref } from 'vue';
import { api } from '@/api/index';
import type { MetricKey } from './use-sale-performance';

export interface ScoreWeight {
  metricKey: MetricKey;
  label: string;
  weight: number;
  isDefault: boolean;
}

export function useSaleScoreConfig() {
  const weights = ref<ScoreWeight[]>([]);
  const defaults = ref<Record<MetricKey, number> | null>(null);
  const loading = ref(false);
  const saving = ref(false);

  async function fetchConfig() {
    loading.value = true;
    try {
      const res = await api.get('/sale-score-config');
      weights.value = res.data.weights ?? [];
      defaults.value = res.data.defaults ?? null;
    } finally {
      loading.value = false;
    }
  }

  async function updateWeights(rows: Array<{ metricKey: MetricKey; weight: number }>) {
    saving.value = true;
    try {
      const res = await api.put('/sale-score-config', { weights: rows });
      weights.value = res.data.weights ?? [];
      return res.data.weights as ScoreWeight[];
    } finally {
      saving.value = false;
    }
  }

  async function resetToDefaults() {
    saving.value = true;
    try {
      const res = await api.post('/sale-score-config/reset');
      weights.value = res.data.weights ?? [];
      return res.data.weights as ScoreWeight[];
    } finally {
      saving.value = false;
    }
  }

  return {
    weights,
    defaults,
    loading,
    saving,
    fetchConfig,
    updateWeights,
    resetToDefaults,
  };
}
