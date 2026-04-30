<template>
  <v-row dense>
    <!-- Card 1: VIP at-risk -->
    <v-col cols="12" md="4">
      <v-card class="pa-4 nds-alert-card h-100">
        <div class="d-flex align-center mb-2">
          <span style="font-size: 20px;">💎</span>
          <div class="text-h6 ml-2">VIP sắp churn</div>
          <v-spacer />
          <v-chip size="x-small" color="error" variant="flat">
            {{ alerts?.vipsAtRisk.count ?? 0 }}
          </v-chip>
        </div>
        <div
          v-if="!alerts?.vipsAtRisk.count"
          class="text-center pa-4 text-medium-emphasis"
        >
          <v-icon size="32" color="success">mdi-check-decagram</v-icon>
          <div class="text-caption mt-1">Không có VIP nào sắp churn</div>
        </div>
        <div v-else>
          <div
            v-for="vip in alerts.vipsAtRisk.top"
            :key="vip.contactId"
            class="alert-row"
          >
            <div class="alert-row__main">
              <div class="font-weight-medium text-truncate">{{ vip.fullName ?? '(không tên)' }}</div>
              <div class="text-caption text-medium-emphasis">
                DS: {{ formatVNDShort(vip.lifetimeRevenue) }} ·
                <span class="text-error">{{ vip.daysSinceLastOrder }}d</span>
              </div>
            </div>
            <v-btn
              size="x-small"
              variant="tonal"
              color="primary"
              prepend-icon="mdi-bell-ring-outline"
              :disabled="!vip.assignedUser"
              @click="$emit('notify-sale', vip)"
            >
              Báo
            </v-btn>
          </div>
        </div>
      </v-card>
    </v-col>

    <!-- Card 2: Stuck deals -->
    <v-col cols="12" md="4">
      <v-card class="pa-4 nds-alert-card h-100">
        <div class="d-flex align-center mb-2">
          <span style="font-size: 20px;">⏱️</span>
          <div class="text-h6 ml-2">Deal stuck >14d</div>
          <v-spacer />
          <v-chip size="x-small" color="warning" variant="flat">
            {{ alerts?.stuckDeals.count ?? 0 }}
          </v-chip>
        </div>
        <div
          v-if="!alerts?.stuckDeals.count"
          class="text-center pa-4 text-medium-emphasis"
        >
          <v-icon size="32" color="success">mdi-check-decagram</v-icon>
          <div class="text-caption mt-1">Không có deal nào stuck</div>
        </div>
        <div v-else>
          <div
            v-for="d in alerts.stuckDeals.top"
            :key="d.contactId"
            class="alert-row"
          >
            <div class="alert-row__main">
              <div class="font-weight-medium text-truncate">{{ d.fullName ?? '(không tên)' }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ formatVNDShort(d.potentialValue) }} ·
                {{ stageLabel(d.stage) }} · stuck {{ d.daysIdle }}d
              </div>
            </div>
          </div>
          <v-btn
            block
            size="small"
            variant="tonal"
            class="mt-2"
            append-icon="mdi-arrow-right"
            @click="$emit('open-pipeline')"
          >
            Xem Pipeline
          </v-btn>
        </div>
      </v-card>
    </v-col>

    <!-- Card 3: Underperforming sales -->
    <v-col cols="12" md="4">
      <v-card class="pa-4 nds-alert-card h-100">
        <div class="d-flex align-center mb-2">
          <span style="font-size: 20px;">⚠️</span>
          <div class="text-h6 ml-2">Sale dưới chuẩn</div>
          <v-spacer />
          <v-chip size="x-small" color="error" variant="flat">
            {{ alerts?.underperformingSales.count ?? 0 }}
          </v-chip>
        </div>
        <div
          v-if="!alerts?.underperformingSales.count"
          class="text-center pa-4 text-medium-emphasis"
        >
          <v-icon size="32" color="success">mdi-check-decagram</v-icon>
          <div class="text-caption mt-1">Tất cả sale đều ≥60</div>
        </div>
        <div v-else>
          <div
            v-for="s in alerts.underperformingSales.items"
            :key="s.saleId"
            class="alert-row"
          >
            <div class="alert-row__main">
              <div class="font-weight-medium text-truncate">{{ s.saleName }}</div>
              <div class="text-caption text-error">Score {{ Math.round(s.score) }}/100</div>
            </div>
          </div>
          <v-btn
            block
            size="small"
            variant="tonal"
            class="mt-2"
            append-icon="mdi-arrow-right"
            @click="$emit('open-ceo')"
          >
            Xem Dashboard CEO
          </v-btn>
        </div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  formatVNDShort,
  type CriticalAlerts,
} from '@/composables/use-admin-dashboard';

interface Props {
  alerts: CriticalAlerts | null;
}
defineProps<Props>();
defineEmits<{
  (e: 'notify-sale', vip: any): void;
  (e: 'open-pipeline'): void;
  (e: 'open-ceo'): void;
}>();

const STAGE_LABELS: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
};

function stageLabel(s: string): string {
  return STAGE_LABELS[s] ?? s;
}
</script>

<style scoped>
.nds-alert-card {
  border-left: 3px solid #EF4444;
}

.alert-row {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 8px;
  gap: 8px;
  margin-bottom: 6px;
}

.alert-row__main { flex: 1; min-width: 0; }
</style>
