<template>
  <v-row dense>
    <!-- Lịch hẹn hôm nay -->
    <v-col cols="12" md="6">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-3">
          <span style="font-size: 22px;">📅</span>
          <div class="text-h6 ml-2">Lịch hẹn hôm nay</div>
          <v-spacer />
          <v-chip v-if="appointments.length" size="x-small" variant="tonal" color="primary">
            {{ appointments.length }}
          </v-chip>
        </div>
        <div v-if="!appointments.length" class="text-center pa-6 text-medium-emphasis">
          <v-icon size="40" color="grey-darken-1">mdi-calendar-blank-outline</v-icon>
          <div class="mt-2 text-body-2">Hôm nay không có lịch hẹn 🙌</div>
        </div>
        <div v-else class="task-list">
          <div
            v-for="appt in appointments"
            :key="appt.id"
            class="task-row"
          >
            <div class="task-row__time">{{ appt.appointmentTime ?? '—' }}</div>
            <div class="task-row__main">
              <div class="d-flex align-center">
                <span class="font-weight-medium">{{ appt.contactName ?? '(không tên)' }}</span>
                <v-chip
                  v-if="appt.customerType"
                  size="x-small"
                  variant="tonal"
                  color="info"
                  class="ml-2"
                >
                  {{ customerTypeLabel(appt.customerType) }}
                </v-chip>
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ appt.notes || appt.type || 'Không có ghi chú' }}
              </div>
            </div>
            <div class="task-row__action">
              <v-btn
                size="x-small"
                variant="text"
                @click="$emit('open-contact', appt.contactId)"
              >Xem</v-btn>
            </div>
          </div>
        </div>
      </v-card>
    </v-col>

    <!-- Đại lý đến hạn liên hệ -->
    <v-col cols="12" md="6">
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
        <div v-else class="task-list">
          <div
            v-for="r in reminders"
            :key="r.contactId"
            class="task-row"
            :class="{ 'is-overdue': r.daysOverdue > 0 }"
          >
            <div
              class="task-row__time"
              :class="r.daysOverdue > 0 ? 'text-error' : 'text-warning'"
            >
              <template v-if="r.daysOverdue > 0">+{{ r.daysOverdue }}d</template>
              <template v-else-if="r.daysOverdue === 0">Hôm nay</template>
              <template v-else>{{ Math.abs(r.daysOverdue) }}d</template>
            </div>
            <div class="task-row__main">
              <div class="d-flex align-center">
                <span class="font-weight-medium">{{ r.contactName ?? '(không tên)' }}</span>
                <v-chip
                  v-if="r.customerType"
                  size="x-small"
                  variant="tonal"
                  color="info"
                  class="ml-2"
                >
                  {{ customerTypeLabel(r.customerType) }}
                </v-chip>
              </div>
              <div class="text-caption text-medium-emphasis text-truncate">
                {{ r.internalNote || 'Đến hạn follow-up' }}
              </div>
            </div>
            <div class="task-row__action d-flex" style="gap: 4px;">
              <v-btn
                size="x-small"
                variant="tonal"
                color="primary"
                icon="mdi-chat-processing"
                :title="`Mở Zalo${r.phone ? ' — ' + r.phone : ''}`"
                @click="$emit('open-zalo', r.contactId)"
              />
              <v-btn
                size="x-small"
                variant="text"
                icon="mdi-check"
                title="Đánh dấu đã liên hệ"
                @click="$emit('mark-contacted', r.contactId)"
              />
            </div>
          </div>
        </div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  customerTypeLabel,
  type DueReminder,
  type TodayAppointment,
} from '@/composables/use-personal-dashboard';

interface Props {
  appointments: TodayAppointment[];
  reminders: DueReminder[];
}
defineProps<Props>();
defineEmits<{
  (e: 'open-contact', contactId: string): void;
  (e: 'open-zalo', contactId: string): void;
  (e: 'mark-contacted', contactId: string): void;
}>();
</script>

<style scoped>
.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 10px;
  gap: 12px;
  transition: border-color 0.15s, transform 0.12s;
}

.task-row:hover {
  border-color: var(--brand-amber-500);
  transform: translateX(2px);
}

.task-row.is-overdue {
  border-left: 3px solid #EF4444;
}

.task-row__time {
  font-weight: 700;
  font-size: 13px;
  width: 60px;
  flex-shrink: 0;
}

.task-row__main {
  flex: 1;
  min-width: 0;
}

.task-row__action {
  flex-shrink: 0;
}
</style>
