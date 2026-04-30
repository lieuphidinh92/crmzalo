/**
 * use-cadence-progress — fetch the 4-row weekly cadence widget data.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface CadenceRow {
  categoryKey: string;
  label: string;
  icon: string;
  total: number;
  done: number;
  percent: number;
}

export function useCadenceProgress() {
  const rows = ref<CadenceRow[]>([]);
  const loading = ref(false);

  async function fetchProgress() {
    loading.value = true;
    try {
      const res = await api.get('/tasks/cadence-progress');
      rows.value = res.data.rows ?? [];
    } finally {
      loading.value = false;
    }
  }

  return { rows, loading, fetchProgress };
}

export function cadenceColor(percent: number): string {
  if (percent >= 80) return 'success';
  if (percent >= 50) return 'warning';
  return 'error';
}
