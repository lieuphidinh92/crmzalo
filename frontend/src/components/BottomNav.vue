<template>
  <nav class="nds-bottom-nav" role="navigation" aria-label="Điều hướng chính">
    <button
      v-for="tab in tabs"
      :key="tab.path"
      :class="['nds-bottom-nav__item', { 'is-active': isActive(tab) }]"
      :aria-label="tab.label"
      :aria-current="isActive(tab) ? 'page' : undefined"
      type="button"
      @click="go(tab)"
    >
      <v-icon :icon="tab.icon" :size="22" />
      <span>{{ tab.label }}</span>
      <span v-if="isActive(tab)" class="nds-bottom-nav__dot" />
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

interface Tab {
  path: string;
  icon: string;
  label: string;
  /** Routes that should also light up this tab (e.g. detail pages) */
  matchPrefix?: string[];
}

const tabs: Tab[] = [
  { path: '/', icon: 'mdi-view-dashboard-outline', label: 'Dashboard' },
  { path: '/chat', icon: 'mdi-message-text-outline', label: 'Tin nhắn' },
  { path: '/contacts', icon: 'mdi-account-group-outline', label: 'Khách hàng', matchPrefix: ['/patients'] },
  { path: '/orders', icon: 'mdi-cart-outline', label: 'Đơn hàng' },
  { path: '/more', icon: 'mdi-dots-horizontal', label: 'Thêm' },
];

const route = useRoute();
const router = useRouter();

const currentPath = computed(() => route.path);

function isActive(tab: Tab): boolean {
  if (tab.path === '/') return currentPath.value === '/';
  if (currentPath.value.startsWith(tab.path)) return true;
  if (tab.matchPrefix) {
    return tab.matchPrefix.some((p) => currentPath.value.startsWith(p));
  }
  return false;
}

function go(tab: Tab) {
  if (currentPath.value === tab.path) return;
  router.push(tab.path);
}
</script>
