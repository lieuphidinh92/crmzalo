<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <span style="font-size: 20px;">🔁</span>
      <div class="text-h6 ml-2">Cadence tuần này</div>
    </div>

    <div v-if="loading" class="text-center pa-4">
      <v-progress-circular indeterminate size="20" />
    </div>

    <div v-else-if="rows.length === 0" class="text-center pa-4 text-medium-emphasis">
      <v-icon size="40" color="grey-darken-1">mdi-progress-clock</v-icon>
      <div class="mt-2 text-body-2">Chưa có task định kỳ tuần này</div>
    </div>

    <div v-else class="cadence-list">
      <div v-for="row in rows" :key="row.categoryKey" class="cadence-row">
        <div class="d-flex align-center mb-1">
          <span class="cadence-row__icon">{{ row.icon }}</span>
          <span class="cadence-row__label flex-grow-1">{{ row.label }}</span>
          <span class="cadence-row__count">
            {{ row.done }}/{{ row.total }}
            <span class="text-medium-emphasis">({{ Math.round(row.percent) }}%)</span>
          </span>
        </div>
        <v-progress-linear
          :model-value="row.percent"
          :color="cadenceColor(row.percent)"
          height="4"
          rounded
        />
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {
  cadenceColor,
  type CadenceRow,
} from '@/composables/use-cadence-progress';

interface Props {
  rows: CadenceRow[];
  loading: boolean;
}
defineProps<Props>();
</script>

<style scoped>
.cadence-list { display: flex; flex-direction: column; gap: 10px; }

.cadence-row__icon { font-size: 16px; margin-right: 8px; }
.cadence-row__label { font-size: 13px; font-weight: 500; }
.cadence-row__count { font-size: 12px; font-weight: 600; }
</style>
