<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-2">
      <span style="font-size: 22px;">📋</span>
      <div class="text-h6 ml-2">Hôm nay bạn có {{ totalToday }} việc</div>
      <v-spacer />
      <span class="text-caption text-medium-emphasis">
        Đã xong {{ doneCount }}/{{ totalToday }}
      </span>
    </div>

    <v-progress-linear
      :model-value="totalToday === 0 ? 0 : (doneCount / totalToday) * 100"
      :color="completionColor"
      height="6"
      rounded
      class="mb-3"
    />

    <div v-if="loading" class="text-center pa-4">
      <v-progress-circular indeterminate size="20" />
    </div>

    <div v-else-if="tasks.length === 0" class="text-center pa-6 text-medium-emphasis">
      <v-icon size="40" color="success">mdi-check-decagram</v-icon>
      <div class="mt-2 text-body-2">Tuyệt vời, không còn task nào!</div>
    </div>

    <div v-else class="task-list">
      <div
        v-for="t in tasks"
        :key="t.id"
        class="task-row"
      >
        <v-btn
          :icon="t.status === 'done' ? 'mdi-check-circle' : 'mdi-circle-outline'"
          size="small"
          variant="text"
          :color="t.status === 'done' ? 'success' : 'grey'"
          :loading="markingId === t.id"
          :disabled="t.status === 'done'"
          @click="$emit('done', t.id)"
        />
        <div class="task-row__main">
          <div class="d-flex align-center">
            <span style="font-size: 14px;">{{ t.category.icon }}</span>
            <span class="task-row__title ml-2">{{ t.title }}</span>
          </div>
          <div class="text-caption text-medium-emphasis">
            <span v-if="t.dueTime">{{ t.dueTime }}</span>
            <span v-if="t.contact"> · {{ t.contact.fullName }}</span>
          </div>
        </div>
        <span class="task-row__priority" :class="`is-${priorityColor(t.priority)}`" />
      </div>
    </div>

    <v-btn
      block
      size="small"
      variant="text"
      append-icon="mdi-arrow-right"
      class="mt-2"
      @click="$emit('open-tasks')"
    >
      Xem tất cả
    </v-btn>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueTime: string | null;
  category: { icon: string; name: string; color: string };
  contact: { fullName: string | null } | null;
}

interface Props {
  tasks: Task[];
  totalToday: number;
  doneCount: number;
  loading: boolean;
  markingId: string | null;
}

const props = defineProps<Props>();
defineEmits<{
  (e: 'done', taskId: string): void;
  (e: 'open-tasks'): void;
}>();

const completionColor = computed(() => {
  if (props.totalToday === 0) return 'grey';
  const pct = (props.doneCount / props.totalToday) * 100;
  if (pct >= 80) return 'success';
  if (pct >= 50) return 'warning';
  return 'error';
});

function priorityColor(p: number): string {
  if (p === 1) return 'error';
  if (p === 3) return 'grey';
  return 'warning';
}
</script>

<style scoped>
.task-list { display: flex; flex-direction: column; gap: 4px; }

.task-row {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 8px;
  gap: 6px;
}

.task-row__main { flex: 1; min-width: 0; }

.task-row__title {
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row__priority {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.task-row__priority.is-error { background: #EF4444; }
.task-row__priority.is-warning { background: #F59E0B; }
.task-row__priority.is-grey { background: #7A8AA0; }
</style>
