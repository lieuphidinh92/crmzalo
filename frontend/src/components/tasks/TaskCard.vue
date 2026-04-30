<template>
  <div :class="['task-card', { 'is-overdue': isOverdue, 'is-done': task.status === 'done' }]">
    <div class="d-flex align-start" style="gap: 8px;">
      <!-- Checkbox -->
      <v-btn
        :icon="task.status === 'done' ? 'mdi-check-circle' : 'mdi-circle-outline'"
        size="small"
        variant="text"
        :color="task.status === 'done' ? 'success' : 'grey'"
        :disabled="task.status === 'done' || task.status === 'skipped'"
        @click.stop="$emit('done', task)"
      />

      <div class="task-card__main flex-grow-1" @click="$emit('select', task)">
        <div class="d-flex align-center">
          <div class="task-card__title flex-grow-1">{{ task.title }}</div>
          <v-tooltip :text="prio.label" location="top">
            <template #activator="{ props: tipProps }">
              <span
                v-bind="tipProps"
                class="task-card__priority"
                :class="`is-${prio.color}`"
              />
            </template>
          </v-tooltip>
        </div>
        <div v-if="task.description" class="text-caption text-medium-emphasis text-truncate">
          {{ task.description }}
        </div>
        <div class="d-flex align-center mt-1" style="gap: 6px;">
          <v-chip
            v-if="task.contact"
            size="x-small"
            variant="tonal"
            color="info"
            prepend-icon="mdi-account-outline"
          >
            {{ task.contact.fullName ?? '(không tên)' }}
          </v-chip>
          <span class="task-card__time" :class="{ 'text-error': isOverdue }">
            <v-icon size="12">mdi-clock-outline</v-icon>
            {{ dueDisplay }}
          </span>
          <v-tooltip :text="src.label" location="top">
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps" class="task-card__source">{{ src.icon }}</span>
            </template>
          </v-tooltip>
        </div>
      </div>

      <!-- Actions (hover-revealed on desktop) -->
      <div class="task-card__actions">
        <v-btn
          icon="mdi-clock-edit-outline"
          size="x-small"
          variant="text"
          title="Hoãn"
          @click.stop="$emit('snooze', task)"
        />
        <v-btn
          icon="mdi-close-circle-outline"
          size="x-small"
          variant="text"
          title="Bỏ qua"
          @click.stop="$emit('skip', task)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  priorityLabel,
  sourceMeta,
  type TaskRow,
} from '@/composables/use-tasks';

interface Props {
  task: TaskRow;
}

const props = defineProps<Props>();
defineEmits<{
  (e: 'done', task: TaskRow): void;
  (e: 'snooze', task: TaskRow): void;
  (e: 'skip', task: TaskRow): void;
  (e: 'select', task: TaskRow): void;
}>();

const prio = computed(() => priorityLabel(props.task.priority));
const src = computed(() => sourceMeta(props.task.source));

const isOverdue = computed(() => {
  if (props.task.status !== 'pending') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(props.task.dueDate) < today;
});

const dueDisplay = computed(() => {
  const due = new Date(props.task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor(
    (due.getTime() - today.getTime()) / 86_400_000,
  );
  let datePart: string;
  if (diff === 0) datePart = 'Hôm nay';
  else if (diff === -1) datePart = 'Hôm qua';
  else if (diff < 0) datePart = `Quá ${Math.abs(diff)}d`;
  else if (diff === 1) datePart = 'Mai';
  else datePart = `${diff}d nữa`;
  return props.task.dueTime ? `${datePart} ${props.task.dueTime}` : datePart;
});
</script>

<style scoped>
.task-card {
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.12s;
}

.task-card:hover {
  border-color: var(--brand-amber-500);
  transform: translateX(2px);
}

.task-card.is-overdue {
  border-left: 3px solid #EF4444;
}

.task-card.is-done {
  opacity: 0.55;
  text-decoration: line-through;
}

.task-card__main { min-width: 0; }

.task-card__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-card__priority {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 6px;
  flex-shrink: 0;
}
.task-card__priority.is-error { background: #EF4444; }
.task-card__priority.is-warning { background: #F59E0B; }
.task-card__priority.is-grey { background: #7A8AA0; }

.task-card__time {
  font-size: 11px;
  color: var(--text-muted);
}

.task-card__source { font-size: 12px; }

.task-card__actions {
  flex-shrink: 0;
  display: flex;
  gap: 2px;
  opacity: 0.4;
  transition: opacity 0.15s;
}

.task-card:hover .task-card__actions {
  opacity: 1;
}
</style>
