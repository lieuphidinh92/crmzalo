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

    <!-- KHU 1: Today tasks -->
    <TodayTasks
      :appointments="todayAppointments"
      :reminders="dueReminders"
      class="mb-4"
      @open-contact="openContactProfile"
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
      @add-appointment="addAppointment"
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
import TodayTasks from './personal/TodayTasks.vue';
import MyAtRiskAgents from './personal/MyAtRiskAgents.vue';
import MyKpiRow from './personal/MyKpiRow.vue';
import MyMiniPipeline from './personal/MyMiniPipeline.vue';
import QuickActions from './personal/QuickActions.vue';
import QuickNoteDialog from './personal/QuickNoteDialog.vue';
import { usePersonalDashboard } from '@/composables/use-personal-dashboard';
import { useContacts } from '@/composables/use-contacts';
import { useAuthStore } from '@/stores/auth';

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
  todayAppointments,
  dueReminders,
  myAtRisk,
  kpi,
  pipeline,
  badges,
  fetchAll,
} = usePersonalDashboard();

const { fetchContactConversations } = useContacts();

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
    const { api } = await import('@/api/index');
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

function addAppointment() {
  router.push('/appointments');
}

async function onQuickNoteSaved(_contactId: string) {
  toast.value = {
    show: true,
    text: 'Đã lưu ghi chú vào hồ sơ KH',
    color: 'success',
  };
}

onMounted(fetchAll);
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
