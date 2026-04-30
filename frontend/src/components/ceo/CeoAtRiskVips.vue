<template>
  <v-card class="pa-4 nds-vip-card">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-alert-octagram" color="error" class="mr-2" />
      <div class="text-h6">Cảnh báo cần xử lý ngay</div>
      <v-spacer />
      <span class="text-caption text-medium-emphasis">
        Top 5 VIP đang sắp churn — ưu tiên cứu KH lớn
      </span>
    </div>

    <div v-if="!vips.length" class="text-center pa-6 text-medium-emphasis">
      <v-icon size="48" color="success">mdi-check-decagram-outline</v-icon>
      <div class="mt-2">Tất cả VIP đều khỏe! 🎉</div>
    </div>

    <div v-else class="vip-list">
      <div
        v-for="vip in vips"
        :key="vip.contactId"
        class="vip-row"
      >
        <div class="vip-row__main">
          <div class="d-flex align-center">
            <div class="font-weight-medium">
              {{ vip.fullName || '(không tên)' }}
            </div>
            <v-chip
              v-if="vip.customerType"
              size="x-small"
              variant="tonal"
              color="info"
              class="ml-2"
            >
              {{ customerTypeLabel(vip.customerType) }}
            </v-chip>
            <v-spacer />
            <span class="vip-row__days">
              <v-icon size="14" color="error">mdi-clock-alert-outline</v-icon>
              {{ vip.daysSinceLastOrder }} ngày
            </span>
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            <span v-if="vip.storeName">{{ vip.storeName }} · </span>
            Sale: {{ vip.assignedUser?.fullName ?? '—' }} ·
            DS lifetime: <strong>{{ formatVNDShort(vip.lifetimeRevenue) }}</strong>
          </div>
        </div>
        <div class="vip-row__action">
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-bell-ring-outline"
            :loading="notifying === vip.contactId"
            :disabled="!vip.assignedUser"
            @click="$emit('notify', vip)"
          >
            Báo Sale chăm ngay
          </v-btn>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {
  customerTypeLabel,
  formatVNDShort,
  type AtRiskVip,
} from '@/composables/use-ceo-dashboard';

interface Props {
  vips: AtRiskVip[];
  notifying: string | null;
}

defineProps<Props>();
defineEmits<{ (e: 'notify', vip: AtRiskVip): void }>();
</script>

<style scoped>
.nds-vip-card {
  border-left: 3px solid #EF4444;
  background: linear-gradient(
    90deg,
    rgba(239, 68, 68, 0.08) 0%,
    var(--brand-navy-700) 30%
  ) !important;
}

.vip-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vip-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 10px;
  gap: 12px;
}

.vip-row__main { flex: 1; min-width: 0; }
.vip-row__days { color: #EF4444; font-weight: 600; font-size: 12px; }
.vip-row__action { flex-shrink: 0; }
</style>
