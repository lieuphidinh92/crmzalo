<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-table-large" color="primary" class="mr-2" />
      <div class="text-h6">Cohort retention 12 tháng</div>
      <v-spacer />
      <span class="text-caption text-medium-emphasis">
        % đại lý cohort vẫn đặt hàng tại tháng tương ứng
      </span>
    </div>

    <div v-if="!cohort?.cohorts.length" class="text-center pa-8 text-medium-emphasis">
      <v-icon size="48" color="grey-darken-1">mdi-grid-large</v-icon>
      <div class="mt-2">Chưa có cohort nào để phân tích</div>
    </div>

    <div v-else class="cohort-wrapper">
      <table class="cohort-table">
        <thead>
          <tr>
            <th rowspan="2" class="cohort-head">Cohort</th>
            <th rowspan="2" class="cohort-head text-right">Size</th>
            <th
              v-for="off in monthOffsets"
              :key="off"
              class="cohort-head"
            >
              M{{ off }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in cohort.cohorts" :key="idx">
            <td class="cohort-row-label">{{ cohort.cohortLabels[idx] }}</td>
            <td class="cohort-row-size text-right">
              {{ row[0]?.cohortSize ?? 0 }}
            </td>
            <td
              v-for="(cell, i) in row"
              :key="i"
              class="cohort-cell"
              :style="cellStyle(cell)"
              :title="cellTooltip(cell)"
            >
              <template v-if="cell.retentionPercent < 0">—</template>
              <template v-else-if="cell.cohortSize === 0">
                <span class="text-disabled">·</span>
              </template>
              <template v-else>{{ Math.round(cell.retentionPercent) }}</template>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="d-flex align-center mt-3" style="gap: 8px;">
        <span class="text-caption text-medium-emphasis">Thang màu:</span>
        <span
          v-for="step in legendSteps"
          :key="step.value"
          class="legend-chip"
          :style="{ background: legendColor(step.value) }"
        >{{ step.label }}</span>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import type { CohortCell } from '@/composables/use-ceo-dashboard';

interface Props {
  cohort: { cohorts: CohortCell[][]; cohortLabels: string[] } | null;
}

const props = defineProps<Props>();

const monthOffsets = Array.from({ length: 13 }, (_, i) => i);

const legendSteps = [
  { value: 0, label: '0%' },
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 75, label: '75%' },
  { value: 100, label: '100%' },
];

function legendColor(percent: number): string {
  // Interpolate red (low) → amber (mid) → green (high).
  if (percent <= 0) return 'rgba(239, 68, 68, 0.7)';
  if (percent <= 25) return 'rgba(239, 68, 68, 0.6)';
  if (percent <= 50) return 'rgba(245, 158, 11, 0.65)';
  if (percent <= 75) return 'rgba(132, 204, 22, 0.55)';
  return 'rgba(16, 185, 129, 0.7)';
}

function cellStyle(cell: CohortCell) {
  if (cell.retentionPercent < 0) {
    return {
      background: 'transparent',
      color: 'var(--text-muted)',
      fontStyle: 'italic',
    };
  }
  if (cell.cohortSize === 0) {
    return { background: 'transparent', color: 'var(--text-muted)' };
  }
  const bg = legendColor(cell.retentionPercent);
  // Text color: dark if >= 50%, light otherwise — keeps WCAG decent.
  const textColor = cell.retentionPercent >= 50 ? '#0A1628' : '#FFFFFF';
  return { background: bg, color: textColor };
}

function cellTooltip(cell: CohortCell): string {
  if (cell.retentionPercent < 0) return 'Chưa đến tháng này';
  return `${cell.retainedCount}/${cell.cohortSize} đại lý active (${cell.retentionPercent.toFixed(1)}%)`;
}

void props;
</script>

<style scoped>
.cohort-wrapper {
  overflow-x: auto;
}

.cohort-table {
  border-collapse: separate;
  border-spacing: 2px;
  font-size: 12px;
  min-width: 100%;
}

.cohort-head {
  background: var(--brand-navy-700);
  color: var(--text-secondary);
  font-weight: 600;
  padding: 6px 8px;
  border-radius: 4px;
  text-align: center;
  white-space: nowrap;
}

.cohort-row-label,
.cohort-row-size {
  background: var(--brand-navy-700);
  color: var(--text-secondary);
  padding: 6px 8px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.cohort-cell {
  text-align: center;
  padding: 6px 4px;
  border-radius: 4px;
  font-weight: 600;
  min-width: 40px;
  transition: transform 0.1s;
}

.cohort-cell:hover {
  transform: scale(1.08);
  z-index: 2;
  position: relative;
  cursor: help;
}

.legend-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
