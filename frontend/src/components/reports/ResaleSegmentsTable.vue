<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-chart-bar" color="primary" class="mr-2" />
      <div class="text-h6">Phân tầng theo thời gian không đặt hàng</div>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <v-table density="comfortable" class="resale-segments-table">
      <thead>
        <tr>
          <th>Phân khúc</th>
          <th>Khoảng (ngày)</th>
          <th class="text-right">Số đại lý</th>
          <th class="text-right">Tổng giá trị tiềm năng</th>
          <th class="text-right">Hành động</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in segments"
          :key="row.key"
          :class="['resale-segments-table__row', segmentClass(row.key)]"
          @click="$emit('open-segment', row.key)"
        >
          <td>
            <v-icon size="14" :color="segmentColor(row.key)" class="mr-1">
              {{ segmentIcon(row.key) }}
            </v-icon>
            <span class="font-weight-medium">{{ row.label }}</span>
          </td>
          <td class="text-medium-emphasis">
            {{ row.min }}
            <span v-if="row.max">– {{ row.max }}</span>
            <span v-else>+</span>
          </td>
          <td class="text-right">
            <span class="text-h6">{{ row.count }}</span>
          </td>
          <td class="text-right">
            <span class="text-body-1 font-weight-medium">
              {{ formatVND(row.potentialValue) }}
            </span>
          </td>
          <td class="text-right">
            <v-btn
              size="x-small"
              variant="tonal"
              color="primary"
              :disabled="row.count === 0"
              append-icon="mdi-arrow-right"
            >
              Xem
            </v-btn>
          </td>
        </tr>
        <tr v-if="!loading && segments.every((s) => s.count === 0)">
          <td colspan="5" class="text-center pa-6 text-medium-emphasis">
            <v-icon size="48" color="grey-darken-1">mdi-database-off-outline</v-icon>
            <div class="mt-2">Chưa có dữ liệu đại lý.</div>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<script setup lang="ts">
import { formatVND, type SegmentRow } from '@/composables/use-resale-report';

interface Props {
  segments: SegmentRow[];
  loading: boolean;
}

defineProps<Props>();
defineEmits<{ (e: 'open-segment', key: string): void }>();

const SEGMENT_COLOR: Record<string, string> = {
  just_ordered: 'success',
  remind: 'info',
  warning: 'warning',
  pre_churn: 'warning',
  pre_churn_heavy: 'error',
  churned: 'error',
};

const SEGMENT_ICON: Record<string, string> = {
  just_ordered: 'mdi-check-circle',
  remind: 'mdi-bell-outline',
  warning: 'mdi-alert-circle-outline',
  pre_churn: 'mdi-alert',
  pre_churn_heavy: 'mdi-alert-octagon-outline',
  churned: 'mdi-account-cancel-outline',
};

function segmentColor(key: string) {
  return SEGMENT_COLOR[key] ?? 'grey';
}
function segmentIcon(key: string) {
  return SEGMENT_ICON[key] ?? 'mdi-circle-outline';
}
function segmentClass(key: string) {
  if (key === 'churned' || key === 'pre_churn_heavy') return 'is-danger';
  if (key === 'pre_churn' || key === 'warning') return 'is-warning';
  return '';
}
</script>

<style scoped>
.resale-segments-table__row {
  cursor: pointer;
  transition: background 0.15s;
}
.resale-segments-table__row:hover {
  background: rgba(245, 158, 11, 0.06);
}
.resale-segments-table__row.is-warning {
  border-left: 2px solid var(--brand-amber-500);
}
.resale-segments-table__row.is-danger {
  border-left: 2px solid #EF4444;
}
</style>
