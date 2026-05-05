<template>
  <v-row class="kpi-grid" dense>
    <v-col v-for="card in cards" :key="card.key" cols="6" md="3">
      <v-card
        class="kpi-card pa-3 h-100"
        :class="`kpi-card--${card.tone}`"
        variant="flat"
      >
        <div class="d-flex align-center mb-2">
          <v-icon :color="card.tone" size="18" class="mr-1">{{ card.icon }}</v-icon>
          <span class="text-caption text-medium-emphasis">{{ card.label }}</span>
        </div>
        <div v-if="loading" class="kpi-skeleton" />
        <template v-else>
          <div class="kpi-number">{{ card.formattedValue }}</div>
          <div class="kpi-meta d-flex align-center mt-1">
            <v-chip
              v-if="card.trendChip"
              :color="card.trendColor"
              size="x-small"
              variant="tonal"
              class="font-weight-bold"
            >
              <v-icon size="14" start>{{ card.trendIcon }}</v-icon>
              {{ card.trendChip }}
            </v-chip>
            <span class="text-caption text-medium-emphasis ml-2">{{ card.subtitle }}</span>
          </div>
        </template>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  formatVNDShort,
  trendColor,
  trendIcon,
  type KpiResponse,
} from '@/composables/use-overview-report';

interface Props {
  data: KpiResponse | null;
  loading: boolean;
}
const props = defineProps<Props>();

interface CardSpec {
  key: string;
  label: string;
  icon: string;
  tone: 'primary' | 'success' | 'warning' | 'info';
  formattedValue: string;
  trendChip: string | null;
  trendColor: 'success' | 'error' | 'grey';
  trendIcon: string;
  subtitle: string;
}

function trendText(pct: number | null): string | null {
  if (pct === null) return null;
  const v = Math.abs(pct);
  return `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${v.toFixed(0)}%`;
}

const cards = computed<CardSpec[]>(() => {
  const c = props.data?.cards;
  if (!c) {
    // skeleton placeholders
    return [
      { key: 'r', label: 'Doanh số tổng', icon: 'mdi-cash-multiple', tone: 'primary', formattedValue: '—', trendChip: null, trendColor: 'grey', trendIcon: 'mdi-minus', subtitle: '' },
      { key: 're', label: 'DS Resale', icon: 'mdi-repeat-variant', tone: 'success', formattedValue: '—', trendChip: null, trendColor: 'grey', trendIcon: 'mdi-minus', subtitle: '' },
      { key: 'a', label: 'Đại lý active', icon: 'mdi-account-check', tone: 'info', formattedValue: '—', trendChip: null, trendColor: 'grey', trendIcon: 'mdi-minus', subtitle: '' },
      { key: 'p', label: 'Lợi nhuận', icon: 'mdi-trending-up', tone: 'warning', formattedValue: '—', trendChip: null, trendColor: 'grey', trendIcon: 'mdi-minus', subtitle: '' },
    ];
  }
  return [
    {
      key: 'totalRevenue',
      label: 'Doanh số tổng',
      icon: 'mdi-cash-multiple',
      tone: 'primary',
      formattedValue: formatVNDShort(c.totalRevenue.value),
      trendChip: trendText(c.totalRevenue.trendPercent),
      trendColor: trendColor(c.totalRevenue.trendPercent),
      trendIcon: trendIcon(c.totalRevenue.trendPercent),
      subtitle: 'so với kỳ trước',
    },
    {
      key: 'resaleRevenue',
      label: 'DS Resale',
      icon: 'mdi-repeat-variant',
      tone: 'success',
      formattedValue: formatVNDShort(c.resaleRevenue.value),
      trendChip: trendText(c.resaleRevenue.trendPercent),
      trendColor: trendColor(c.resaleRevenue.trendPercent),
      trendIcon: trendIcon(c.resaleRevenue.trendPercent),
      subtitle: `${c.resaleRevenue.ratioOfTotal}% tổng DS`,
    },
    {
      key: 'activeAgents',
      label: 'Đại lý active',
      icon: 'mdi-account-check',
      tone: 'info',
      formattedValue: `${c.activeAgents.active}/${c.activeAgents.total}`,
      trendChip:
        c.activeAgents.delta === 0
          ? '0'
          : `${c.activeAgents.delta > 0 ? '+' : ''}${c.activeAgents.delta}`,
      trendColor:
        c.activeAgents.delta > 0
          ? 'success'
          : c.activeAgents.delta < 0
            ? 'error'
            : 'grey',
      trendIcon:
        c.activeAgents.delta > 0
          ? 'mdi-trending-up'
          : c.activeAgents.delta < 0
            ? 'mdi-trending-down'
            : 'mdi-minus',
      subtitle: `${c.activeAgents.rate.toFixed(0)}% active 60d`,
    },
    {
      key: 'profit',
      label: 'Lợi nhuận',
      icon: 'mdi-trending-up',
      tone: 'warning',
      formattedValue: formatVNDShort(c.profit.value),
      trendChip: trendText(c.profit.trendPercent),
      trendColor: trendColor(c.profit.trendPercent),
      trendIcon: trendIcon(c.profit.trendPercent),
      subtitle:
        c.profit.costCoveragePercent < 100
          ? `Biên ${c.profit.marginPercent}% (${c.profit.costCoveragePercent}% có cost)`
          : `Biên LN ${c.profit.marginPercent}%`,
    },
  ];
});
</script>

<style scoped>
.kpi-grid {
  margin: 0;
}
.kpi-card {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  transition: border-color 0.15s;
}
.kpi-card:hover {
  border-color: rgba(245, 158, 11, 0.25);
}
.kpi-number {
  font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.1;
}
.kpi-meta {
  min-height: 24px;
}
.kpi-skeleton {
  height: 28px;
  width: 70%;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.08) 0%,
    rgba(148, 163, 184, 0.18) 50%,
    rgba(148, 163, 184, 0.08) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
