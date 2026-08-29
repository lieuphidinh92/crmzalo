import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useDashboardStore = defineStore('dashboard-context', () => {
  const data = ref(null);

  const sidebar = computed(() => {
    if (!data.value) return null;
    const kpi = data.value.monthlyKpi || {};
    return {
      revenue: kpi.revenue || 0,
      target: kpi.target,
      targetPercent: kpi.targetPercent,
      forecast: kpi.forecast || 0,
      forecastGap: kpi.forecastGap,
      generatedAt: data.value.generatedAt,
    };
  });

  function setDashboard(payload) {
    data.value = payload;
  }

  return { data, sidebar, setDashboard };
});
