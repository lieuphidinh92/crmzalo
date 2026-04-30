<template>
  <div class="personal-dashboard">
    <div class="dashboard-header mb-4">
      <h1 class="text-h5">
        Chào <span class="text-primary">{{ userName }}</span>,
        hôm nay là {{ todayDisplay }}
      </h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Trang làm việc cá nhân — tập trung vào hành động hôm nay
      </p>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <!-- KHU 1a: Top 5 tasks today + weekly cadence -->
    <v-row dense class="mb-2">
      <v-col cols="12" md="6">
        <TodayTasksList
          :tasks="(topTasks as any)"
          :total-today="todayStats.total"
          :done-count="todayStats.done"
          :loading="tasksLoading"
          :marking-id="markingId"
          @done="onMarkTaskDone"
          @open-tasks="$router.push('/tasks')"
        />
      </v-col>
      <v-col cols="12" md="6">
        <WeeklyCadence
          :rows="(cadenceRows as any)"
          :loading="cadenceLoading"
        />
      </v-col>
    </v-row>

    <!-- KHU 1b: Reminders (đại lý đến hạn liên hệ — kept from old block) -->
    <RemindersList
      :reminders="dueReminders"
      class="mb-4"
      @open-zalo="openZaloChat"
      @mark-contacted="markContacted"
    />

    <!-- KHU 2: My at-risk -->
    <MyAtRiskAgents
      :agents="(myAtRisk as any)"
      class="mb-4"
      @open-zalo="openZaloChat"
      @open-profile="openContactProfile"
    />

    <!-- KHU 3: Personal KPI -->
    <MyKpiRow
      :kpi="kpi"
      class="mb-4"
      @open-pipeline="openPipeline"
    />

    <!-- KHU 4: Mini pipeline funnel -->
    <MyMiniPipeline
      :columns="pipeline"
      class="mb-4"
      @open-pipeline="openPipeline"
    />

    <!-- KHU 5: Quick actions -->
    <QuickActions
      :unread-conversations="badges.unreadConversations"
      class="mb-4"
      @open-inbox="openInbox"
      @add-contact="addContact"
      @quick-note="quickNoteOpen = true"
      @add-appointment="addTask"
    />

    <QuickNoteDialog
      v-model="quickNoteOpen"
      @saved="onQuickNoteSaved"
    />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TodayTasksList from './personal/TodayTasksList.vue';
import WeeklyCadence from './personal/WeeklyCadence.vue';
import RemindersList from './personal/RemindersList.vue';
import MyAtRiskAgents from './personal/MyAtRiskAgents.vue';
import MyKpiRow from './personal/MyKpiRow.vue';
import MyMiniPipeline from './personal/MyMiniPipeline.vue';
import QuickActions from './personal/QuickActions.vue';
import QuickNoteDialog from './personal/QuickNoteDialog.vue';
import { usePersonalDashboard } from '@/composables/use-personal-dashboard';
import { useCadenceProgress } from '@/composables/use-cadence-progress';
import { useContacts } from '@/composables/use-contacts';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/index';

const router = useRouter();
const authStore = useAuthStore();

const userName = computed(() => authStore.user?.fullName ?? 'bạn');

const todayDisplay = computed(() =>
  new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
);

const {
  loading,
  error,
  dueReminders,
  myAtRisk,
  kpi,
  pipeline,
  badges,
  fetchAll,
} = usePersonalDashboard();

const { rows: cadenceRows, loading: cadenceLoading, fetchProgress } = useCadenceProgress();
const { fetchContactConversations } = useContacts();

// Top 5 tasks for today + stats
const topTasks = ref<any[]>([]);
const todayStats = ref({ total: 0, done: 0 });
const tasksLoading = ref(false);
const markingId = ref<string | null>(null);

async function fetchTopTasks() {
  tasksLoading.value = true;
  try {
    const [todayRes, listRes] = await Promise.all([
      api.get('/tasks/today').then((r) => r.data),
      api.get('/tasks', { params: { period: 'today' } }).then((r) => r.data),
    ]);
    topTasks.value = todayRes.tasks ?? [];
    todayStats.value = {
      total: listRes.stats?.todayTotal ?? 0,
      done: listRes.stats?.todayDone ?? 0,
    };
  } finally {
    tasksLoading.value = false;
  }
}

async function onMarkTaskDone(taskId: string) {
  markingId.value = taskId;
  try {
    await api.put(`/tasks/${taskId}/done`, { completionNote: null });
    await fetchTopTasks();
    toast.value = { show: true, text: '✅ Hoàn thành!', color: 'success' };
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Lỗi',
      color: 'error',
    };
  } finally {
    markingId.value = null;
  }
}

const quickNoteOpen = ref(false);
const toast = ref({ show: false, text: '', color: 'success' as string });

function openContactProfile(contactId: string) {
  router.push({ path: '/contacts', query: { focus: contactId } });
}

async function openZaloChat(contactId: string) {
  try {
    const conversations = await fetchContactConversations(contactId);
    if (!conversations.length) {
      toast.value = {
        show: true,
        text: 'Chưa có hội thoại Zalo với khách này',
        color: 'warning',
      };
      return;
    }
    router.push({
      path: '/chat',
      query: { conversationId: conversations[0].id },
    });
  } catch {
    toast.value = {
      show: true,
      text: 'Không tìm được hội thoại',
      color: 'error',
    };
  }
}

async function markContacted(contactId: string) {
  // Best-effort: clear nextContactDate so it disappears from the list.
  try {
    await api.put(`/contacts/${contactId}`, { nextContactDate: null });
    toast.value = {
      show: true,
      text: 'Đã đánh dấu liên hệ — refresh sau giây lát',
      color: 'success',
    };
    await fetchAll();
  } catch {
    toast.value = {
      show: true,
      text: 'Không cập nhật được',
      color: 'error',
    };
  }
}

function openPipeline(stage?: string) {
  const query: Record<string, string> = {};
  if (stage) query.stage = stage;
  router.push({ path: '/reports/pipeline', query });
}

function openInbox() {
  router.push('/chat');
}

function addContact() {
  router.push({ path: '/contacts', query: { create: '1' } });
}

function addTask() {
  router.push('/tasks');
}

async function onQuickNoteSaved(_contactId: string) {
  toast.value = {
    show: true,
    text: 'Đã lưu ghi chú vào hồ sơ KH',
    color: 'success',
  };
}

onMounted(async () => {
  await Promise.all([fetchAll(), fetchProgress(), fetchTopTasks()]);
});
</script>

<style scoped>
.personal-dashboard {
  max-width: 1500px;
  margin: 0 auto;
}

.dashboard-header h1 {
  font-weight: 700;
}
</style>
