<template>
  <v-row dense>
    <v-col cols="12" md="6">
      <v-card class="pa-4 nds-alert-card nds-alert-card--danger h-100">
        <div class="d-flex align-center mb-3">
          <span style="font-size: 22px;">🚨</span>
          <div class="text-h6 ml-2">Sale cần can thiệp</div>
          <v-spacer />
          <v-chip v-if="alerts.needsIntervention.length" size="x-small" color="error" variant="flat">
            {{ alerts.needsIntervention.length }}
          </v-chip>
        </div>
        <div v-if="alerts.needsIntervention.length === 0" class="text-center pa-4 text-medium-emphasis">
          Không có vấn đề nghiêm trọng nào — tin tốt!
        </div>
        <div v-else class="alert-list">
          <div
            v-for="(a, i) in alerts.needsIntervention"
            :key="`bad-${i}`"
            class="alert-row"
          >
            <div class="alert-row__main">
              <div class="font-weight-medium">{{ a.saleName }}</div>
              <div class="text-caption text-medium-emphasis">{{ a.reason }}</div>
            </div>
            <div class="alert-row__value">
              <span class="text-error font-weight-bold">{{ a.value }}</span>
            </div>
          </div>
        </div>
      </v-card>
    </v-col>

    <v-col cols="12" md="6">
      <v-card class="pa-4 nds-alert-card nds-alert-card--success h-100">
        <div class="d-flex align-center mb-3">
          <span style="font-size: 22px;">💎</span>
          <div class="text-h6 ml-2">Sale tiềm năng</div>
          <v-spacer />
          <v-chip v-if="alerts.potential.length" size="x-small" color="success" variant="flat">
            {{ alerts.potential.length }}
          </v-chip>
        </div>
        <div v-if="alerts.potential.length === 0" class="text-center pa-4 text-medium-emphasis">
          Chưa phát hiện sale tiềm năng nổi bật.
        </div>
        <div v-else class="alert-list">
          <div
            v-for="(a, i) in alerts.potential"
            :key="`good-${i}`"
            class="alert-row"
          >
            <div class="alert-row__main">
              <div class="font-weight-medium">{{ a.saleName }}</div>
              <div class="text-caption text-medium-emphasis">{{ a.reason }}</div>
            </div>
            <div class="alert-row__value">
              <span class="text-success font-weight-bold">{{ a.value }}</span>
            </div>
          </div>
        </div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import type { SaleAlerts } from '@/composables/use-sale-performance';

interface Props {
  alerts: SaleAlerts;
}

defineProps<Props>();
</script>

<style scoped>
.nds-alert-card--danger {
  border-left: 3px solid #EF4444;
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.06) 0%, var(--brand-navy-700) 30%) !important;
}

.nds-alert-card--success {
  border-left: 3px solid #10B981;
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.06) 0%, var(--brand-navy-700) 30%) !important;
}

.alert-list { display: flex; flex-direction: column; gap: 8px; }

.alert-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 8px;
  gap: 12px;
}

.alert-row__main { flex: 1; min-width: 0; }
.alert-row__value { font-size: 13px; flex-shrink: 0; }
</style>
