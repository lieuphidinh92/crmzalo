<template>
  <v-card class="pa-4 h-100">
    <div class="d-flex align-center mb-3">
      <span style="font-size: 22px;">🔔</span>
      <div class="text-h6 ml-2">Đến hạn liên hệ lại</div>
      <v-spacer />
      <v-chip v-if="reminders.length" size="x-small" variant="tonal" color="warning">
        {{ reminders.length }}
      </v-chip>
    </div>
    <div v-if="!reminders.length" class="text-center pa-6 text-medium-emphasis">
      <v-icon size="40" color="grey-darken-1">mdi-bell-outline</v-icon>
      <div class="mt-2 text-body-2">Không có đại lý nào đến hạn 🎯</div>
    </div>
    <div v-else class="list">
      <div
        v-for="r in reminders"
        :key="r.contactId"
        class="row"
        :class="{ 'is-overdue': r.daysOverdue > 0 }"
      >
        <div
          class="row__time"
          :class="r.daysOverdue > 0 ? 'text-error' : 'text-warning'"
        >
          <template v-if="r.daysOverdue > 0">+{{ r.daysOverdue }}d</template>
          <template v-else-if="r.daysOverdue === 0">Hôm nay</template>
          <template v-else>{{ Math.abs(r.daysOverdue) }}d</template>
        </div>
        <div class="row__main">
          <div class="font-weight-medium">{{ r.contactName ?? '(không tên)' }}</div>
          <div class="text-caption text-medium-emphasis text-truncate">
            {{ r.internalNote || 'Đến hạn follow-up' }}
          </div>
        </div>
        <div class="d-flex" style="gap: 4px; flex-shrink: 0;">
          <v-btn
            size="x-small"
            variant="tonal"
            color="primary"
            icon="mdi-chat-processing"
            @click="$emit('open-zalo', r.contactId)"
          />
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-check"
            @click="$emit('mark-contacted', r.contactId)"
          />
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import type { DueReminder } from '@/composables/use-personal-dashboard';

interface Props {
  reminders: DueReminder[];
}
defineProps<Props>();
defineEmits<{
  (e: 'open-zalo', id: string): void;
  (e: 'mark-contacted', id: string): void;
}>();
</script>

<style scoped>
.list { display: flex; flex-direction: column; gap: 6px; }

.row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 8px;
  gap: 10px;
}

.row.is-overdue { border-left: 3px solid #EF4444; }

.row__time {
  font-weight: 700;
  font-size: 12px;
  width: 50px;
  flex-shrink: 0;
}

.row__main { flex: 1; min-width: 0; }
</style>
