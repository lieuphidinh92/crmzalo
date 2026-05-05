<template>
  <nav class="quick-scroll" aria-label="Quick links">
    <button
      v-for="link in links"
      :key="link.path"
      type="button"
      class="quick-card"
      @click="go(link.path)"
    >
      <v-icon size="22" :color="link.color">{{ link.icon }}</v-icon>
      <span class="ql-label">{{ link.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

interface QuickLink {
  icon: string;
  label: string;
  path: string;
  color: string;
}

const links: ReadonlyArray<QuickLink> = [
  { icon: 'mdi-view-dashboard-variant', label: 'CEO chi tiết', path: '/dashboard/ceo', color: 'primary' },
  { icon: 'mdi-pipe', label: 'Pipeline', path: '/reports/pipeline', color: 'info' },
  { icon: 'mdi-trending-up', label: 'Báo cáo Resale', path: '/reports/resale', color: 'success' },
  { icon: 'mdi-cart-outline', label: 'Đơn hàng', path: '/orders', color: 'warning' },
  { icon: 'mdi-message-text-outline', label: 'Inbox Zalo', path: '/chat', color: 'secondary' },
  { icon: 'mdi-account-multiple-outline', label: 'Khách hàng', path: '/contacts', color: 'primary' },
];

const router = useRouter();
function go(path: string) {
  router.push(path);
}
</script>

<style scoped>
.quick-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 2px 0 6px 0;
  -webkit-overflow-scrolling: touch;
}
.quick-scroll::-webkit-scrollbar { height: 4px; }
.quick-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.18); border-radius: 999px; }

.quick-card {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 100px;
  padding: 12px 16px;
  background: #1E293B;
  border: 1px solid rgba(148, 163, 184, 0.06);
  border-radius: 10px;
  color: #F8FAFC;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, background 0.15s;
}
.quick-card:hover {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(30, 41, 59, 0.85);
  transform: translateY(-1px);
}
.ql-label {
  font-size: 0.72rem;
  font-weight: 500;
  white-space: nowrap;
  letter-spacing: 0.01em;
}
</style>
