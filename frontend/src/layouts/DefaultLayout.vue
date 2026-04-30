<template>
  <v-app :class="{ 'liquid-bg': isDark }">
    <!-- Desktop top bar — hidden on mobile via .nds-desktop-only -->
    <v-app-bar v-if="!mobile" density="comfortable" flat class="nds-desktop-only">
      <v-app-bar-nav-icon @click="drawer = !drawer" />

      <BrandLogo variant="horizontal" :size="36" :theme="isDark ? 'dark' : 'light'" />
      <v-app-bar-title style="display: none;" />

      <GlobalSearch class="mx-2" />

      <v-spacer />

      <div
        class="d-flex align-center mr-4 px-3 py-1"
        style="border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 999px;"
      >
        <span
          class="status-dot"
          style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; display: inline-block; margin-right: 8px;"
        ></span>
        <span class="text-caption font-weight-bold" style="color: #10B981; letter-spacing: 1px;">ONLINE</span>
      </div>

      <span class="text-body-2 mr-3" v-if="authStore.user">{{ authStore.user.fullName }}</span>
      <NotificationBell />
      <v-btn icon variant="text" @click="toggleTheme">
        <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>
      <v-btn icon variant="text" @click="logout">
        <v-icon>mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Mobile header — replaces app bar on small screens -->
    <MobileHeader v-if="mobile" :title="currentRouteTitle" />

    <!-- Sidebar navigation — desktop only -->
    <v-navigation-drawer
      v-if="!mobile"
      v-model="drawer"
      :rail="rail"
      permanent
      @click="rail = false"
    >
      <v-list density="compact" nav class="mt-2">
        <v-list-item
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          :prepend-icon="item.icon"
          :title="item.title"
          :value="item.path"
          rounded="xl"
          class="mb-1 mx-2"
        />
      </v-list>

      <template #append>
        <v-list density="compact" nav>
          <v-list-item
            prepend-icon="mdi-chevron-left"
            title="Thu gọn"
            @click.stop="rail = !rail"
            rounded="xl"
            class="mx-2"
          />
        </v-list>
      </template>
    </v-navigation-drawer>

    <!-- Main content -->
    <v-main :class="{ 'nds-mobile-shell': mobile }">
      <v-container fluid>
        <slot />
      </v-container>
    </v-main>

    <!-- Bottom navigation — mobile only -->
    <BottomNav v-if="mobile" />

    <!-- Offline status indicator (sticky bottom) -->
    <OfflineSnackbar />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTheme, useDisplay } from 'vuetify';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import BrandLogo from '@/components/BrandLogo.vue';
import MobileHeader from '@/components/MobileHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineSnackbar from '@/components/OfflineSnackbar.vue';

const theme = useTheme();
const display = useDisplay();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

// Vuetify breakpoints: xs/sm = mobile (<960). We use <768 to match
// brief; useDisplay().mobile is responsive automatically.
const mobile = computed(() => display.smAndDown.value);

const drawer = ref(true);
const rail = ref(false);
const isDark = ref(localStorage.getItem('theme') !== 'light');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

const allMenuItems = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', path: '/' },
  { title: 'Tin nhắn', icon: 'mdi-message-text-outline', path: '/chat' },
  { title: 'Khách hàng', icon: 'mdi-account-group-outline', path: '/contacts' },
  { title: 'Tài khoản Zalo', icon: 'mdi-cellphone-link', path: '/zalo-accounts' },
  { title: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', path: '/appointments' },
  { title: 'Đơn hàng', icon: 'mdi-cart-outline', path: '/orders' },
  { title: 'Báo cáo', icon: 'mdi-chart-arc', path: '/reports' },
  { title: 'Báo cáo Resale', icon: 'mdi-trending-up', path: '/reports/resale' },
  { title: 'Pipeline cơ hội', icon: 'mdi-pipe', path: '/reports/pipeline' },
  { title: 'Dashboard CEO', icon: 'mdi-view-dashboard-variant', path: '/dashboard/ceo', adminOnly: true },
  { title: 'Nhân viên', icon: 'mdi-account-cog-outline', path: '/settings' },
  { title: 'Công việc AI', icon: 'mdi-robot-outline', path: '/jobs' },
  { title: 'Cấu hình', icon: 'mdi-cog-outline', path: '/ai-settings' },
  { title: 'Trả lời nhanh', icon: 'mdi-message-flash-outline', path: '/quick-replies', adminOnly: true },
  { title: 'Thêm', icon: 'mdi-dots-horizontal', path: '/more' },
];

const menuItems = computed(() => {
  const role = authStore.user?.role ?? '';
  const isAdmin = role === 'owner' || role === 'admin';
  return allMenuItems.filter((item) => !item.adminOnly || isAdmin);
});

const currentRouteTitle = computed(() => {
  // Search the full list (incl. admin-only) so route title resolves
  // even when a non-admin somehow lands on an admin page.
  const match = allMenuItems.find((item) => {
    if (item.path === '/') return route.path === '/';
    return route.path === item.path || route.path.startsWith(`${item.path}/`);
  });
  return match?.title ?? '';
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>
