<template>
  <v-table density="comfortable" hover class="sale-perf-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Sale</th>
        <th class="text-right">DS Resale</th>
        <th class="text-right">%Active</th>
        <th class="text-right">Mới</th>
        <th class="text-right">Conv%</th>
        <th class="text-right">Ret90d</th>
        <th class="text-right">Tuân thủ</th>
        <th class="text-center">Score</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(row, idx) in rows"
        :key="row.saleId"
        @click="$emit('open-detail', row.saleId)"
        class="cursor-pointer"
      >
        <td>
          <v-icon
            v-if="idx < 3"
            :color="['warning', 'grey', 'orange'][idx]"
            size="16"
          >mdi-medal</v-icon>
          <span v-else class="text-medium-emphasis">{{ idx + 1 }}</span>
        </td>
        <td class="font-weight-medium">{{ row.saleName }}</td>

        <td class="text-right">
          <div>{{ formatVNDShort(row.metrics.resaleRevenue) }}</div>
          <div class="metric-bar">
            <div
              class="metric-bar__fill"
              :style="{ width: row.normalized.resale_revenue + '%', background: scoreColor(row.normalized.resale_revenue) }"
            />
          </div>
        </td>
        <td class="text-right">
          <v-tooltip
            :text="`${row.metrics.activeAgents}/${row.metrics.totalAgents} đại lý có order trong 60d`"
            location="top"
          >
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">{{ row.metrics.activeRate.toFixed(0) }}%</span>
            </template>
          </v-tooltip>
          <div class="metric-bar">
            <div
              class="metric-bar__fill"
              :style="{ width: Math.min(row.metrics.activeRate, 100) + '%', background: thresholdColor(row.metrics.activeRate, 60) }"
            />
          </div>
        </td>
        <td class="text-right">
          <v-tooltip text="Số đại lý mới chốt trong tháng" location="top">
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">{{ row.metrics.newAgents }}</span>
            </template>
          </v-tooltip>
        </td>
        <td class="text-right">
          <v-tooltip
            :text="`${row.metrics.convertedCount}/${row.metrics.leadsCount} lead → đại lý chính thức`"
            location="top"
          >
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">{{ row.metrics.conversionRate.toFixed(0) }}%</span>
            </template>
          </v-tooltip>
        </td>
        <td class="text-right">
          <v-tooltip
            :text="`Cohort ${row.metrics.cohort90d} đại lý chốt 90 ngày trước, còn ${row.metrics.stillActive90d} active`"
            location="top"
          >
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">
                {{ row.metrics.cohort90d > 0 ? row.metrics.retention90d.toFixed(0) + '%' : '—' }}
              </span>
            </template>
          </v-tooltip>
        </td>
        <td class="text-right">
          <v-tooltip
            :text="complianceTooltip(row.metrics.complianceBreakdown)"
            location="top"
          >
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">{{ row.metrics.complianceScore.toFixed(0) }}</span>
            </template>
          </v-tooltip>
        </td>
        <td class="text-center">
          <div class="score-cell">
            <v-chip
              size="small"
              :color="scoreChipColor(row.overallScore)"
              variant="flat"
              class="font-weight-bold"
            >
              <span v-if="idx < 3" class="mr-1">⭐</span>
              {{ row.overallScore.toFixed(0) }}
              <span v-if="row.overallScore < 60" class="ml-1">⚠️</span>
            </v-chip>
          </div>
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="9" class="text-center pa-6 text-medium-emphasis">
          Chưa có data sale nào trong tháng này.
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<script setup lang="ts">
import {
  formatVNDShort,
  scoreColor,
  type ComplianceBreakdown,
  type SaleMetrics,
} from '@/composables/use-sale-performance';

interface Props {
  rows: SaleMetrics[];
}

defineProps<Props>();
defineEmits<{ (e: 'open-detail', saleId: string): void }>();

function thresholdColor(value: number, threshold: number): string {
  return value >= threshold ? '#10B981' : '#EF4444';
}

function scoreChipColor(score: number): string {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'error';
}

function complianceTooltip(b: ComplianceBreakdown): string {
  return [
    `Note (${b.noteFreshness.toFixed(0)}/30)`,
    `Stage hygiene (${b.stageHygiene.toFixed(0)}/30)`,
    `Zalo phản hồi (${b.zaloResponseTime.toFixed(0)}/25)`,
    `AI insight (${b.aiInsightUsage.toFixed(0)}/15)`,
  ].join(' · ');
}
</script>

<style scoped>
.sale-perf-table { overflow-x: auto; }
.cursor-pointer { cursor: pointer; }

.metric-bar {
  width: 60px;
  height: 4px;
  background: var(--brand-navy-600);
  border-radius: 2px;
  margin-left: auto;
  margin-top: 2px;
  overflow: hidden;
}

.metric-bar__fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s var(--liquid-ease);
}

.score-cell { display: flex; justify-content: center; }
</style>
