<template>
  <div class="kpi-grid">
    <div v-for="card in cards" :key="card.key" class="kpi-card" :class="`tone-${card.tone}`">
      <!-- Row 1: label + trend -->
      <div class="kpi-head">
        <span class="kpi-label">{{ card.label }}</span>
        <span
          v-if="card.trend.text"
          class="trend-pill"
          :class="`trend-${card.trend.color}`"
        >
          <span class="trend-arrow">{{ card.trend.arrow }}</span>
          {{ card.trend.text }}
        </span>
      </div>

      <!-- Row 2: big number -->
      <div v-if="loading" class="kpi-skeleton" />
      <div v-else class="kpi-value">{{ card.displayValue }}</div>

      <!-- Row 3: sparkline OR progress bar OR subtitle -->
      <template v-if="!loading">
        <div v-if="card.progress !== undefined" class="kpi-progress">
          <div class="progress-track">
            <div
              class="progress-fill"
              :class="`progress-${card.progressColor}`"
              :style="{ width: `${Math.min(100, Math.max(0, card.progress))}%` }"
            />
          </div>
          <div class="kpi-sub">{{ card.subtitle }}</div>
        </div>
        <div v-else class="kpi-spark">
          <OverviewSparkline :values="card.sparkData" :color="card.sparkColor" />
          <div class="kpi-sub">{{ card.subtitle }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import OverviewSparkline from './OverviewSparkline.vue';
import {
  formatVNDShort,
  type KpiResponse,
  type SparklineResponse,
} from '@/composables/use-overview-report';

interface Props {
  data: KpiResponse | null;
  spark: SparklineResponse | null;
  loading: boolean;
}
const props = defineProps<Props>();

interface CardSpec {
  key: string;
  label: string;
  tone: 'primary' | 'success' | 'info' | 'warning';
  displayValue: string;
  trend: { text: string | null; arrow: string; color: 'up' | 'down' | 'flat' };
  subtitle: string;
  sparkData: number[];
  sparkColor: string;
  progress?: number;
  progressColor?: 'good' | 'warn' | 'bad';
}

function trendChip(pct: number | null) {
  if (pct === null) return { text: null, arrow: '', color: 'flat' as const };
  if (pct > 0.5)
    return { text: `+${Math.abs(pct).toFixed(0)}%`, arrow: '↗', color: 'up' as const };
  if (pct < -0.5)
    return { text: `-${Math.abs(pct).toFixed(0)}%`, arrow: '↘', color: 'down' as const };
  return { text: '0%', arrow: '─', color: 'flat' as const };
}

const cards = computed<CardSpec[]>(() => {
  const c = props.data?.cards;
  const sp = props.spark;
  // Skeleton/empty placeholder shape
  if (!c) {
    return [
      { key: '1', label: 'DOANH SỐ', tone: 'primary', displayValue: '—', trend: { text: null, arrow: '', color: 'flat' }, subtitle: '', sparkData: [], sparkColor: '#F97316' },
      { key: '2', label: 'DS RESALE', tone: 'success', displayValue: '—', trend: { text: null, arrow: '', color: 'flat' }, subtitle: '', sparkData: [], sparkColor: '#10B981' },
      { key: '3', label: 'ĐẠI LÝ ACTIVE', tone: 'info', displayValue: '—', trend: { text: null, arrow: '', color: 'flat' }, subtitle: '', sparkData: [], sparkColor: '#0EA5E9' },
      { key: '4', label: 'LỢI NHUẬN', tone: 'warning', displayValue: '—', trend: { text: null, arrow: '', color: 'flat' }, subtitle: '', sparkData: [], sparkColor: '#F59E0B' },
    ];
  }

  const activeRate = c.activeAgents.rate;
  const progressColor: 'good' | 'warn' | 'bad' =
    activeRate >= 70 ? 'good' : activeRate >= 50 ? 'warn' : 'bad';

  return [
    {
      key: 'totalRevenue',
      label: 'DOANH SỐ',
      tone: 'primary',
      displayValue: formatVNDShort(c.totalRevenue.value),
      trend: trendChip(c.totalRevenue.trendPercent),
      subtitle: 'vs kỳ trước',
      sparkData: sp?.totalRevenue ?? [],
      sparkColor: '#F97316',
    },
    {
      key: 'resaleRevenue',
      label: 'DS RESALE',
      tone: 'success',
      displayValue: formatVNDShort(c.resaleRevenue.value),
      trend: trendChip(c.resaleRevenue.trendPercent),
      subtitle: `${c.resaleRevenue.ratioOfTotal}% tổng DS`,
      sparkData: sp?.resaleRevenue ?? [],
      sparkColor: '#10B981',
    },
    {
      key: 'activeAgents',
      label: 'ĐẠI LÝ ACTIVE',
      tone: 'info',
      displayValue: `${c.activeAgents.active}/${c.activeAgents.total}`,
      trend:
        c.activeAgents.delta === 0
          ? { text: '0', arrow: '─', color: 'flat' as const }
          : c.activeAgents.delta > 0
            ? { text: `+${c.activeAgents.delta}`, arrow: '↗', color: 'up' as const }
            : { text: `${c.activeAgents.delta}`, arrow: '↘', color: 'down' as const },
      subtitle: `${activeRate.toFixed(0)}% active 60d`,
      sparkData: [],
      sparkColor: '#0EA5E9',
      progress: activeRate,
      progressColor,
    },
    {
      key: 'profit',
      label: 'LỢI NHUẬN',
      tone: 'warning',
      displayValue: formatVNDShort(c.profit.value),
      trend: trendChip(c.profit.trendPercent),
      subtitle:
        c.profit.costCoveragePercent < 100
          ? `Biên ${c.profit.marginPercent}% (${c.profit.costCoveragePercent}% có cost)`
          : `Biên LN ${c.profit.marginPercent}%`,
      sparkData: sp?.profit ?? [],
      sparkColor: '#F59E0B',
    },
  ];
});
</script>

<style scoped>
/* ── Grid: 2×2 mobile, 4×1 ≥640px (per spec, never stack 1-col) ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
@media (min-width: 640px) {
  .kpi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
}

/* ── Card ── */
.kpi-card {
  background: #1e293b; /* slate-800 */
  border: 1px solid rgba(148, 163, 184, 0.06);
  border-radius: 12px;
  padding: 12px;
  transition: border-color 0.18s, transform 0.18s;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 110px;
}
.kpi-card:hover {
  border-color: rgba(245, 158, 11, 0.2);
  transform: translateY(-1px);
}

/* tone accent on left edge — subtle */
.tone-primary { box-shadow: inset 2px 0 0 #F97316; }
.tone-success { box-shadow: inset 2px 0 0 #10B981; }
.tone-info    { box-shadow: inset 2px 0 0 #0EA5E9; }
.tone-warning { box-shadow: inset 2px 0 0 #F59E0B; }

/* ── Head row ── */
.kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.kpi-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748B; /* slate-500 */
  white-space: nowrap;
}
.trend-pill {
  font-size: 0.65rem;
  font-weight: 600;
  font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
  padding: 2px 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.trend-arrow {
  font-size: 0.78rem;
  line-height: 1;
}
.trend-up   { background: rgba(16, 185, 129, 0.12); color: #10B981; }
.trend-down { background: rgba(239, 68, 68, 0.12);  color: #EF4444; }
.trend-flat { background: rgba(245, 158, 11, 0.12); color: #F59E0B; }

/* ── Big number ── */
.kpi-value {
  font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 1.35rem;
  font-weight: 500;          /* spec: not heavy bold */
  letter-spacing: -0.01em;
  color: #F8FAFC;
  line-height: 1.1;
}
@media (min-width: 640px) {
  .kpi-value { font-size: 1.55rem; }
}

/* ── Sparkline + subtitle ── */
.kpi-spark {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-sub {
  font-size: 0.68rem;
  color: #64748B;
  letter-spacing: 0.01em;
}

/* ── Progress bar (Card 3 only) ── */
.kpi-progress { display: flex; flex-direction: column; gap: 6px; }
.progress-track {
  width: 100%;
  height: 4px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease-out;
}
.progress-good { background: #10B981; }
.progress-warn { background: #F59E0B; }
.progress-bad  { background: #EF4444; }

/* ── Skeleton ── */
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
