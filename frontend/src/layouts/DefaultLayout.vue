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
      <v-list
        :opened="openedGroups"
        density="compact"
        nav
        class="mt-2"
        @update:opened="handleOpenedUpdate"
      >
        <!-- Standalone Dashboard item -->
        <v-list-item
          :to="dashboardItem.path"
          :prepend-icon="dashboardItem.icon"
          :title="dashboardItem.title"
          :value="dashboardItem.path"
          rounded="xl"
          class="mb-1 mx-2"
        />

        <!-- Collapsible groups -->
        <v-list-group
          v-for="group in visibleGroups"
          :key="group.key"
          :value="group.key"
        >
          <template #activator="{ props: activatorProps, isOpen }">
            <v-list-item
              v-bind="activatorProps"
              :prepend-icon="group.icon"
              rounded="xl"
              class="mx-2 nds-group-header"
            >
              <v-list-item-title class="nds-group-title">
                {{ group.title }}
              </v-list-item-title>
              <template #append>
                <v-icon
                  size="small"
                  :class="['nds-chevron', { 'nds-chevron--open': isOpen }]"
                  icon="mdi-chevron-down"
                />
              </template>
            </v-list-item>
          </template>

          <v-list-item
            v-for="item in visibleItemsOf(group)"
            :key="item.path"
            :to="item.path"
            :prepend-icon="item.icon"
            :value="item.path"
            rounded="xl"
            class="mb-1 mx-2"
          >
            <v-list-item-title>
              {{ item.title }}
              <span v-if="item.badge" class="ml-1">{{ item.badge }}</span>
            </v-list-item-title>
          </v-list-item>
        </v-list-group>
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
import { ref, computed, onMounted, watch } from 'vue';
import { useTheme, useDisplay } from 'vuetify';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import BrandLogo from '@/components/BrandLogo.vue';
import MobileHeader from '@/components/MobileHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineSnackbar from '@/components/OfflineSnackbar.vue';

interface MenuItem {
  title: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
  badge?: string;
}

interface MenuGroup {
  key: string;
  title: string;
  icon: string;
  adminOnly?: boolean;
  items: MenuItem[];
}

const theme = useTheme();
const display = useDisplay();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const mobile = computed(() => display.smAndDown.value);

const drawer = ref(true);
const rail = ref(false);
const isDark = ref(localStorage.getItem('theme') !== 'light');

const dashboardItem: MenuItem = {
  title: 'Dashboard',
  icon: 'mdi-view-dashboard-outline',
  path: '/',
};

const allGroups: MenuGroup[] = [
  {
    key: 'communication',
    title: 'GIAO TIẾP',
    icon: 'mdi-message-processing-outline',
    items: [
      { title: 'Tin nhắn', icon: 'mdi-message-text-outline', path: '/chat' },
      { title: 'Trả lời nhanh', icon: 'mdi-message-flash-outline', path: '/quick-replies', adminOnly: true },
      { title: 'Tài khoản Zalo', icon: 'mdi-cellphone-link', path: '/zalo-accounts' },
    ],
  },
  {
    key: 'customers',
    title: 'KHÁCH HÀNG',
    icon: 'mdi-account-group-outline',
    items: [
      { title: 'Danh sách KH', icon: 'mdi-account-multiple-outline', path: '/contacts' },
      { title: 'Pipeline cơ hội', icon: 'mdi-pipe', path: '/reports/pipeline' },
    ],
  },
  {
    key: 'sales',
    title: 'BÁN HÀNG',
    icon: 'mdi-shopping-outline',
    items: [
      { title: 'Sản phẩm', icon: 'mdi-package-variant-closed', path: '/products' },
      { title: 'Đơn hàng', icon: 'mdi-cart-outline', path: '/orders' },
      { title: 'Nhập hàng', icon: 'mdi-truck-delivery-outline', path: '/imports', adminOnly: true },
      { title: 'Quản lý kho', icon: 'mdi-warehouse', path: '/inventory' },
      { title: 'Công nợ NCC', icon: 'mdi-bank-outline', path: '/supplier-debt', adminOnly: true },
    ],
  },
  {
    key: 'tasks',
    title: 'CÔNG VIỆC',
    icon: 'mdi-clipboard-check-outline',
    items: [
      { title: 'Việc cần làm', icon: 'mdi-checkbox-marked-circle-outline', path: '/tasks' },
      { title: 'Học tập', icon: 'mdi-school-outline', path: '/tasks/learning' },
    ],
  },
  {
    key: 'reports',
    title: 'BÁO CÁO',
    icon: 'mdi-chart-bar',
    items: [
      { title: 'Báo cáo tổng quan', icon: 'mdi-view-dashboard-outline', path: '/reports/overview' },
      { title: 'Báo cáo tổng hợp', icon: 'mdi-chart-arc', path: '/reports' },
      { title: 'Báo cáo Resale', icon: 'mdi-trending-up', path: '/reports/resale' },
      { title: 'Dashboard CEO', icon: 'mdi-view-dashboard-variant', path: '/dashboard/ceo', adminOnly: true, badge: '👑' },
    ],
  },
  {
    key: 'system',
    title: 'HỆ THỐNG',
    icon: 'mdi-cog-outline',
    adminOnly: true,
    items: [
      { title: 'Nhân viên', icon: 'mdi-account-cog-outline', path: '/settings' },
      { title: 'Brand & NCC', icon: 'mdi-tag-multiple-outline', path: '/settings/brands' },
      { title: 'Công việc AI', icon: 'mdi-robot-outline', path: '/jobs' },
      { title: 'Cấu hình', icon: 'mdi-tune-variant', path: '/ai-settings' },
      { title: 'Cấu hình Cadence', icon: 'mdi-calendar-clock', path: '/settings/cadence' },
      { title: 'Thêm', icon: 'mdi-dots-horizontal', path: '/more' },
    ],
  },
];

const isAdmin = computed(() => {
  const role = authStore.user?.role ?? '';
  return role === 'owner' || role === 'admin';
});

const visibleGroups = computed(() =>
  allGroups.filter((g) => !g.adminOnly || isAdmin.value),
);

function visibleItemsOf(group: MenuGroup): MenuItem[] {
  return group.items.filter((item) => !item.adminOnly || isAdmin.value);
}

const DEFAULT_OPEN = ['communication', 'customers', 'sales'];

function getStorageKey(): string {
  const uid = authStore.user?.id ?? 'anon';
  return `sidebar_groups_state_${uid}`;
}

function loadOpenState(): string[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [...DEFAULT_OPEN];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed;
    }
  } catch {
    // fall through to defaults on bad JSON
  }
  return [...DEFAULT_OPEN];
}

// Hydrate at setup time so Vuetify's <v-list> sees the correct initial
// :opened on first render (avoids a stray reset emit that would
// overwrite our defaults with []).
const openedGroups = ref<string[]>(loadOpenState());


function findGroupForPath(path: string): string | null {
  for (const g of allGroups) {
    for (const item of g.items) {
      if (item.path === '/') {
        if (path === '/') return g.key;
        continue;
      }
      if (path === item.path || path.startsWith(`${item.path}/`)) {
        return g.key;
      }
    }
  }
  return null;
}

function ensureRouteGroupOpen(path: string): void {
  const key = findGroupForPath(path);
  if (key && !openedGroups.value.includes(key)) {
    openedGroups.value = [...openedGroups.value, key];
    persistOpenState();
  }
}

// Vuetify's <v-list> emits one stray `update:opened` with [] right after
// mount as child <v-list-group> instances register with useNested. We
// drop that single emit (it's the only [] we'll see before any user
// click) so it doesn't clobber our hydrated defaults.
const mountTime = ref(0);

function handleOpenedUpdate(val: unknown): void {
  if (!Array.isArray(val)) return;
  const next = val.filter((x): x is string => typeof x === 'string');
  const sinceMount = Date.now() - mountTime.value;
  if (next.length === 0 && openedGroups.value.length > 0 && sinceMount < 500) {
    return;
  }
  openedGroups.value = next;
  persistOpenState();
}

function persistOpenState(): void {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(openedGroups.value));
  } catch {
    // ignore quota errors
  }
}

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  mountTime.value = Date.now();
  ensureRouteGroupOpen(route.path);
});

watch(
  () => route.path,
  (newPath) => {
    ensureRouteGroupOpen(newPath);
  },
);

const currentRouteTitle = computed(() => {
  if (route.path === '/') return dashboardItem.title;
  for (const g of allGroups) {
    for (const item of g.items) {
      if (item.path === '/') continue;
      if (route.path === item.path || route.path.startsWith(`${item.path}/`)) {
        return item.title;
      }
    }
  }
  return '';
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

<style scoped>
.nds-group-title {
  font-size: 0.7rem !important;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--text-muted, #7a8aa0);
  text-transform: uppercase;
}

.nds-group-header :deep(.v-list-item__prepend > .v-icon) {
  color: var(--text-muted, #7a8aa0);
  opacity: 0.85;
}

.nds-chevron {
  transition: transform 0.3s ease-in-out;
  color: var(--text-muted, #7a8aa0);
}

.nds-chevron--open {
  transform: rotate(180deg);
}
</style>
