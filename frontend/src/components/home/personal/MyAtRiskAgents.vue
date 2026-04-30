<template>
  <v-card class="pa-4" :class="agents.length > 0 ? 'nds-warning-card' : ''">
    <div class="d-flex align-center mb-3">
      <span style="font-size: 22px;">{{ agents.length > 0 ? '⚠️' : '🎉' }}</span>
      <div class="text-h6 ml-2">
        <template v-if="agents.length > 0">
          Bạn có {{ agents.length }} đại lý sắp mất
        </template>
        <template v-else>
          Tệp khách của bạn đang khoẻ mạnh
        </template>
      </div>
    </div>

    <div v-if="agents.length === 0" class="text-center pa-4 text-medium-emphasis">
      <div class="text-body-2">
        Tất cả đại lý đặt hàng đều đặn — tiếp tục giữ tốt nhé!
      </div>
    </div>

    <div v-else class="vip-list">
      <div
        v-for="agent in agents"
        :key="agent.contactId"
        class="vip-row"
      >
        <div class="vip-row__main">
          <div class="d-flex align-center">
            <span class="font-weight-medium">{{ agent.fullName ?? '(không tên)' }}</span>
            <v-chip
              v-if="agent.customerType"
              size="x-small"
              variant="tonal"
              color="info"
              class="ml-2"
            >
              {{ customerTypeLabel(agent.customerType) }}
            </v-chip>
          </div>
          <div class="text-caption text-medium-emphasis">
            <span v-if="agent.storeName">{{ agent.storeName }} · </span>
            DS: <strong>{{ formatVNDShort(agent.lifetimeRevenue) }}</strong> ·
            <span class="text-error">
              {{ agent.daysSinceLastOrder }} ngày chưa đặt
            </span>
          </div>
        </div>
        <div class="d-flex" style="gap: 4px; flex-shrink: 0;">
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-chat-processing"
            @click="$emit('open-zalo', agent.contactId)"
          >Liên hệ</v-btn>
          <v-btn
            size="small"
            variant="text"
            icon="mdi-account-details-outline"
            title="Xem profile"
            @click="$emit('open-profile', agent.contactId)"
          />
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {
  customerTypeLabel,
  formatVNDShort,
  type MyAtRiskAgent,
} from '@/composables/use-personal-dashboard';

interface Props {
  agents: MyAtRiskAgent[];
}
defineProps<Props>();
defineEmits<{
  (e: 'open-zalo', contactId: string): void;
  (e: 'open-profile', contactId: string): void;
}>();
</script>

<style scoped>
.nds-warning-card {
  border-left: 3px solid #EF4444;
  background: linear-gradient(
    90deg,
    rgba(239, 68, 68, 0.06) 0%,
    var(--brand-navy-700) 30%
  ) !important;
}

.vip-list { display: flex; flex-direction: column; gap: 8px; }

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
</style>
