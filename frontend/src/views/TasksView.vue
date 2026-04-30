<template>
  <div class="tasks-view">
    <!-- 3-column layout collapses to tabs on mobile via CSS -->
    <div class="tasks-grid">
      <!-- Cột 1: Filter & Stats -->
      <aside class="tasks-grid__sidebar">
        <!-- Stats -->
        <v-card class="pa-3 mb-3">
          <div class="d-flex align-center mb-2">
            <span style="font-size: 18px;">📋</span>
            <div class="text-subtitle-2 ml-2">Hôm nay</div>
            <v-spacer />
            <span class="text-h6 font-weight-bold">
              {{ stats?.todayDone ?? 0 }}/{{ stats?.todayTotal ?? 0 }}
            </span>
          </div>
          <div v-if="stats && stats.overdue > 0" class="overdue-row">
            <v-icon size="14" color="error">mdi-alert-circle</v-icon>
            <span class="text-error font-weight-medium">{{ stats.overdue }} quá hạn</span>
          </div>
          <v-divider class="my-2" />
          <div class="text-caption text-medium-emphasis">Hoàn thành tuần</div>
          <v-progress-linear
            :model-value="stats?.weekCompletionPercent ?? 0"
            color="primary"
            height="6"
            rounded
            class="mt-1"
          />
          <div class="text-caption mt-1">
            {{ stats?.weekDone ?? 0 }} / {{ stats?.weekTotal ?? 0 }} task ({{ Math.round(stats?.weekCompletionPercent ?? 0) }}%)
          </div>
        </v-card>

        <!-- Period tabs -->
        <v-card class="pa-3 mb-3">
          <v-btn-toggle
            v-model="filters.period"
            density="compact"
            variant="outlined"
            divided
            mandatory
            @update:model-value="fetchTasks"
          >
            <v-btn value="today" size="small">Hôm nay</v-btn>
            <v-btn value="week" size="small">Tuần</v-btn>
            <v-btn value="month" size="small">Tháng</v-btn>
            <v-btn value="all" size="small">Tất cả</v-btn>
          </v-btn-toggle>

          <v-divider class="my-3" />

          <div class="text-caption text-medium-emphasis mb-1">Phân loại</div>
          <v-chip-group
            v-model="filters.categoryIds"
            multiple
            column
            @update:model-value="fetchTasks"
          >
            <v-chip
              v-for="cat in categories"
              :key="cat.id"
              :value="cat.id"
              size="small"
              filter
              variant="tonal"
            >
              {{ cat.icon }} {{ cat.name }}
            </v-chip>
          </v-chip-group>

          <v-divider class="my-3" />

          <div class="text-caption text-medium-emphasis mb-1">Trạng thái</div>
          <v-chip-group
            v-model="filters.statuses"
            multiple
            column
            @update:model-value="fetchTasks"
          >
            <v-chip value="pending" size="small" filter variant="tonal">Pending</v-chip>
            <v-chip value="done" size="small" filter variant="tonal">Đã làm</v-chip>
            <v-chip value="skipped" size="small" filter variant="tonal">Bỏ qua</v-chip>
          </v-chip-group>

          <v-divider class="my-3" />

          <div class="text-caption text-medium-emphasis mb-1">Nguồn</div>
          <v-chip-group
            v-model="filters.sources"
            multiple
            column
            @update:model-value="fetchTasks"
          >
            <v-chip value="auto" size="small" filter variant="tonal">🤖 Auto</v-chip>
            <v-chip value="recurring" size="small" filter variant="tonal">🔄 Định kỳ</v-chip>
            <v-chip value="manual" size="small" filter variant="tonal">👤 Thủ công</v-chip>
          </v-chip-group>
        </v-card>

        <!-- Quick actions -->
        <v-btn
          color="primary"
          block
          prepend-icon="mdi-plus"
          class="mb-2"
          @click="addOpen = true"
        >
          Thêm task thủ công
        </v-btn>
      </aside>

      <!-- Cột 2: Task list grouped by category -->
      <main class="tasks-grid__main">
        <div class="d-flex align-center mb-3">
          <h1 class="text-h5">
            <v-icon class="mr-2" color="primary">mdi-checkbox-marked-circle-outline</v-icon>
            Việc cần làm
          </h1>
          <v-spacer />
          <v-btn
            prepend-icon="mdi-refresh"
            variant="tonal"
            size="small"
            :loading="loading"
            @click="fetchTasks"
          >
            Làm mới
          </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

        <div v-if="!loading && groupedTasks.length === 0" class="text-center pa-12">
          <v-icon size="80" color="success">mdi-emoticon-cool-outline</v-icon>
          <div class="text-h6 mt-3">Tuyệt vời, bạn đã xong việc!</div>
          <div class="text-body-2 text-medium-emphasis mt-1">
            Không có task nào trong khoảng thời gian này.
          </div>
        </div>

        <div v-else>
          <div
            v-for="group in groupedTasks"
            :key="group.category.id"
            class="task-group mb-4"
          >
            <div
              class="task-group__header"
              :style="{ borderLeftColor: groupColor(group.category.color) }"
              @click="toggleGroup(group.category.id)"
            >
              <span style="font-size: 18px;">{{ group.category.icon }}</span>
              <span class="ml-2 font-weight-bold text-uppercase">
                {{ group.category.name }}
              </span>
              <span class="ml-2 text-medium-emphasis">({{ group.tasks.length }})</span>
              <v-spacer />
              <v-icon size="18">
                {{ collapsedGroups[group.category.id] ? 'mdi-chevron-right' : 'mdi-chevron-down' }}
              </v-icon>
            </div>
            <div v-if="!collapsedGroups[group.category.id]" class="task-group__list mt-2">
              <TaskCard
                v-for="t in group.tasks"
                :key="t.id"
                :task="(t as TaskRow)"
                @done="onDone"
                @snooze="onSnooze"
                @skip="onSkip"
                @select="selectTask"
              />
            </div>
          </div>
        </div>
      </main>

      <!-- Cột 3: Detail panel -->
      <aside class="tasks-grid__detail">
        <v-card v-if="!selected" class="pa-6 text-center text-medium-emphasis">
          <v-icon size="48" color="grey-darken-1">mdi-information-outline</v-icon>
          <div class="text-body-2 mt-2">Chọn task để xem chi tiết</div>
        </v-card>
        <v-card v-else class="pa-4">
          <div class="d-flex align-center mb-2">
            <span style="font-size: 20px;">{{ selected.category.icon }}</span>
            <span class="ml-2 text-overline text-medium-emphasis">
              {{ selected.category.name }}
            </span>
          </div>
          <div class="text-h6 mb-1">{{ selected.title }}</div>
          <div v-if="selected.description" class="text-body-2 text-medium-emphasis mb-3">
            {{ selected.description }}
          </div>

          <div class="info-row">
            <span class="info-row__label">Hạn</span>
            <span class="info-row__value">
              {{ formatDate(selected.dueDate) }}
              <span v-if="selected.dueTime" class="text-medium-emphasis"> · {{ selected.dueTime }}</span>
            </span>
          </div>
          <div class="info-row">
            <span class="info-row__label">Nguồn</span>
            <span class="info-row__value">
              {{ sourceMeta(selected.source).icon }} {{ sourceMeta(selected.source).label }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-row__label">Ưu tiên</span>
            <v-chip
              size="x-small"
              :color="priorityLabel(selected.priority).color"
              variant="tonal"
            >{{ priorityLabel(selected.priority).label }}</v-chip>
          </div>

          <!-- Linked contact snapshot -->
          <template v-if="selected.contact">
            <v-divider class="my-3" />
            <div class="text-caption text-medium-emphasis mb-1">Khách hàng liên kết</div>
            <v-card variant="tonal" class="pa-2">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-account-circle-outline</v-icon>
                <div class="flex-grow-1">
                  <div class="font-weight-medium">{{ selected.contact.fullName }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ selected.contact.storeName ?? '' }}
                    <span v-if="selected.contact.phone"> · {{ selected.contact.phone }}</span>
                  </div>
                </div>
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-arrow-right"
                  @click="openContact(selected.contact.id)"
                />
              </div>
            </v-card>
          </template>

          <v-divider class="my-3" />

          <div class="d-flex" style="gap: 4px;">
            <v-btn
              color="success"
              size="small"
              variant="flat"
              prepend-icon="mdi-check"
              :disabled="selected.status !== 'pending' && selected.status !== 'in_progress'"
              @click="onDone(selected)"
            >Đã làm</v-btn>
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-clock-edit-outline"
              @click="onSnooze(selected)"
            >Hoãn</v-btn>
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-close"
              @click="onSkip(selected)"
            >Bỏ qua</v-btn>
          </div>
        </v-card>
      </aside>
    </div>

    <TaskDoneDialog
      v-model="doneOpen"
      :task="actionTarget"
      :saving="saving"
      @submit="submitDone"
    />
    <TaskSnoozeDialog
      v-model="snoozeOpen"
      :task="actionTarget"
      :saving="saving"
      @submit="submitSnooze"
    />
    <TaskSkipDialog
      v-model="skipOpen"
      :task="actionTarget"
      :saving="saving"
      @submit="submitSkip"
    />
    <AddTaskDialog
      v-model="addOpen"
      :categories="(categories as any)"
      :saving="saving"
      @submit="submitCreate"
    />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import TaskCard from '@/components/tasks/TaskCard.vue';
import TaskDoneDialog from '@/components/tasks/TaskDoneDialog.vue';
import TaskSnoozeDialog from '@/components/tasks/TaskSnoozeDialog.vue';
import TaskSkipDialog from '@/components/tasks/TaskSkipDialog.vue';
import AddTaskDialog from '@/components/tasks/AddTaskDialog.vue';
import {
  categoryColorHex,
  priorityLabel,
  sourceMeta,
  useTasks,
  type TaskCategory,
  type TaskRow,
} from '@/composables/use-tasks';

const router = useRouter();
const {
  filters,
  tasks,
  categories,
  stats,
  loading,
  fetchCategories,
  fetchTasks,
  markDone,
  snoozeTask,
  skipTask,
  createManual,
} = useTasks();

const collapsedGroups = reactive<Record<string, boolean>>({});
const selected = ref<TaskRow | null>(null);

const doneOpen = ref(false);
const snoozeOpen = ref(false);
const skipOpen = ref(false);
const addOpen = ref(false);
const actionTarget = ref<TaskRow | null>(null);
const saving = ref(false);
const toast = ref({ show: false, text: '', color: 'success' as string });

const groupedTasks = computed(() => {
  const map = new Map<string, { category: TaskCategory; tasks: TaskRow[] }>();
  for (const t of tasks.value) {
    const cat = t.category;
    const cur = map.get(cat.id);
    if (cur) cur.tasks.push(t as TaskRow);
    else map.set(cat.id, { category: cat, tasks: [t as TaskRow] });
  }
  return [...map.values()].sort(
    (a, b) => a.category.sortOrder - b.category.sortOrder,
  );
});

function toggleGroup(id: string) {
  collapsedGroups[id] = !collapsedGroups[id];
}

function groupColor(token: string) {
  return categoryColorHex(token);
}

function selectTask(t: TaskRow) {
  selected.value = t;
}

function onDone(t: TaskRow) {
  actionTarget.value = t;
  doneOpen.value = true;
}
function onSnooze(t: TaskRow) {
  actionTarget.value = t;
  snoozeOpen.value = true;
}
function onSkip(t: TaskRow) {
  actionTarget.value = t;
  skipOpen.value = true;
}

async function submitDone({
  completionNote,
  metadataPatch,
}: {
  completionNote: string;
  metadataPatch: Record<string, unknown>;
}) {
  if (!actionTarget.value) return;
  saving.value = true;
  try {
    await markDone(actionTarget.value.id, completionNote, metadataPatch);
    toast.value = { show: true, text: '✅ Hoàn thành!', color: 'success' };
    doneOpen.value = false;
    selected.value = null;
  } catch (err: any) {
    toast.value = { show: true, text: err?.response?.data?.error ?? 'Lỗi', color: 'error' };
  } finally {
    saving.value = false;
  }
}

async function submitSnooze({
  newDue,
  newTime,
}: {
  newDue: string;
  newTime: string | null;
}) {
  if (!actionTarget.value) return;
  saving.value = true;
  try {
    await snoozeTask(actionTarget.value.id, newDue, newTime);
    toast.value = { show: true, text: 'Đã hoãn task', color: 'info' };
    snoozeOpen.value = false;
  } catch (err: any) {
    toast.value = { show: true, text: err?.response?.data?.error ?? 'Lỗi', color: 'error' };
  } finally {
    saving.value = false;
  }
}

async function submitSkip(reason: string) {
  if (!actionTarget.value) return;
  saving.value = true;
  try {
    await skipTask(actionTarget.value.id, reason);
    toast.value = { show: true, text: 'Đã bỏ qua', color: 'warning' };
    skipOpen.value = false;
  } catch (err: any) {
    toast.value = { show: true, text: err?.response?.data?.error ?? 'Lỗi', color: 'error' };
  } finally {
    saving.value = false;
  }
}

async function submitCreate(payload: {
  categoryId: string;
  title: string;
  dueDate: string;
  dueTime: string;
  priority: number;
  description: string;
}) {
  saving.value = true;
  try {
    await createManual({
      categoryId: payload.categoryId,
      title: payload.title.trim(),
      dueDate: payload.dueDate,
      dueTime: payload.dueTime || undefined,
      priority: payload.priority,
      description: payload.description?.trim() || undefined,
    });
    toast.value = { show: true, text: 'Đã tạo task', color: 'success' };
    addOpen.value = false;
  } catch (err: any) {
    toast.value = { show: true, text: err?.response?.data?.error ?? 'Lỗi', color: 'error' };
  } finally {
    saving.value = false;
  }
}

function openContact(contactId: string) {
  router.push({ path: '/contacts', query: { focus: contactId } });
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN');
}

onMounted(async () => {
  await fetchCategories();
  await fetchTasks();
});
</script>

<style scoped>
.tasks-view { max-width: 1700px; margin: 0 auto; }

.tasks-grid {
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 16px;
}

@media (max-width: 1280px) {
  .tasks-grid {
    grid-template-columns: 240px 1fr 280px;
  }
}

@media (max-width: 960px) {
  .tasks-grid {
    grid-template-columns: 1fr;
  }
  .tasks-grid__detail { display: none; }
}

.tasks-grid__sidebar { min-width: 0; }
.tasks-grid__main { min-width: 0; }
.tasks-grid__detail { min-width: 0; }

.overdue-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  font-size: 12px;
}

.task-group__header {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: var(--brand-navy-800);
  border-radius: 8px;
  border-left: 3px solid var(--brand-navy-500);
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.task-group__header:hover {
  background: var(--brand-navy-700);
}

.task-group__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 8px;
}

.info-row {
  display: flex;
  padding: 4px 0;
  font-size: 12px;
}

.info-row__label {
  width: 60px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.info-row__value {
  flex: 1;
  color: var(--text-primary);
}
</style>
