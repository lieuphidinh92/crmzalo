<template>
  <div class="more-view">
    <h1 class="text-h5 mb-4 d-flex align-center">
      <v-icon icon="mdi-dots-horizontal-circle-outline" class="mr-2" color="primary" />
      Thêm
    </h1>

    <v-card v-for="group in groups" :key="group.label" class="mb-4">
      <v-card-subtitle class="pt-3 pb-1 text-caption text-uppercase">
        {{ group.label }}
      </v-card-subtitle>
      <v-list density="comfortable" nav>
        <v-list-item
          v-for="item in group.items"
          :key="item.path ?? item.action"
          :prepend-icon="item.icon"
          :title="item.title"
          :subtitle="item.subtitle"
          rounded="lg"
          :to="item.path"
          @click="item.action ? handleAction(item.action) : null"
        >
          <template #append>
            <v-icon icon="mdi-chevron-right" size="20" color="grey" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <p class="text-caption text-center text-grey mt-6">
      ngheduocsi.vn — Nơi nghề dược sĩ cất lời.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

interface MoreItem {
  title: string;
  subtitle?: string;
  icon: string;
  path?: string;
  action?: 'logout';
}

const router = useRouter();
const authStore = useAuthStore();

const groups: { label: string; items: MoreItem[] }[] = [
  {
    label: 'Vận hành',
    items: [
      { title: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', path: '/appointments' },
    ],
  },
  {
    label: 'Kết nối & vận hành',
    items: [
      { title: 'Tài khoản Zalo', icon: 'mdi-cellphone-link', path: '/zalo-accounts' },
      { title: 'Báo cáo', icon: 'mdi-chart-arc', path: '/reports' },
      { title: 'Báo cáo Resale', icon: 'mdi-trending-up', path: '/reports/resale' },
      { title: 'Pipeline cơ hội', icon: 'mdi-pipe', path: '/reports/pipeline' },
      { title: 'Dashboard CEO', icon: 'mdi-view-dashboard-variant', path: '/dashboard/ceo' },
    ],
  },
  {
    label: 'Tự động hóa AI',
    items: [
      { title: 'Công việc AI', icon: 'mdi-robot-outline', path: '/jobs' },
      { title: 'Cấu hình', icon: 'mdi-cog-outline', path: '/ai-settings' },
      { title: 'Trả lời nhanh', icon: 'mdi-message-flash-outline', path: '/quick-replies' },
    ],
  },
  {
    label: 'Tài khoản',
    items: [
      { title: 'Nhân viên', icon: 'mdi-account-cog-outline', path: '/settings' },
      { title: 'Đăng xuất', icon: 'mdi-logout', action: 'logout' },
    ],
  },
];

function handleAction(action: 'logout') {
  if (action === 'logout') {
    authStore.logout();
    router.push('/login');
  }
}
</script>

<style scoped>
.more-view {
  max-width: 720px;
  margin: 0 auto;
}
</style>
