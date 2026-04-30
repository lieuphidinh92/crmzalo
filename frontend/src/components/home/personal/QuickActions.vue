<template>
  <v-row dense>
    <v-col v-for="action in actions" :key="action.key" cols="6" md="3">
      <v-card
        class="pa-4 quick-action h-100"
        @click="action.handler"
      >
        <div class="d-flex align-center mb-2 quick-action__header">
          <span class="quick-action__icon">{{ action.icon }}</span>
          <v-spacer />
          <!-- Badge slot — extensible: add more chips here when SLA Tracker ships -->
          <v-chip
            v-for="badge in action.badges"
            :key="badge.key"
            :color="badge.color"
            size="x-small"
            variant="flat"
            class="ml-1"
          >
            {{ badge.value }}
          </v-chip>
        </div>
        <div class="quick-action__label">{{ action.label }}</div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Badge {
  key: string;
  value: string | number;
  color: string;
}

interface Props {
  unreadConversations: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'open-inbox'): void;
  (e: 'add-contact'): void;
  (e: 'quick-note'): void;
  (e: 'add-appointment'): void;
}>();

const actions = computed(() => [
  {
    key: 'inbox',
    icon: '💬',
    label: 'Mở Inbox',
    badges: props.unreadConversations
      ? ([{ key: 'unread', value: props.unreadConversations, color: 'error' }] as Badge[])
      : ([] as Badge[]),
    handler: () => emit('open-inbox'),
  },
  {
    key: 'add-contact',
    icon: '➕',
    label: 'Thêm KH mới',
    badges: [] as Badge[],
    handler: () => emit('add-contact'),
  },
  {
    key: 'quick-note',
    icon: '📞',
    label: 'Ghi chú cuộc gọi',
    badges: [] as Badge[],
    handler: () => emit('quick-note'),
  },
  {
    key: 'appointment',
    icon: '📅',
    label: 'Đặt lịch hẹn',
    badges: [] as Badge[],
    handler: () => emit('add-appointment'),
  },
]);
</script>

<style scoped>
.quick-action {
  cursor: pointer;
  transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s;
  border: 1px solid var(--brand-navy-600);
}

.quick-action:hover {
  border-color: var(--brand-amber-500);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.15);
}

.quick-action__icon { font-size: 28px; }
.quick-action__label { font-weight: 600; color: var(--text-primary); }
</style>
