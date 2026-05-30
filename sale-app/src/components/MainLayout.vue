<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import BottomNav from './BottomNav.vue';

const auth = useAuthStore();
const userName = computed(() => auth.user?.fullName || auth.user?.email || 'Sale');

function handleLogout() {
  if (confirm('Đăng xuất?')) auth.logout();
}
</script>

<template>
  <div class="min-h-[100dvh] bg-gray-50 flex flex-col">
    <header
      class="sticky top-0 z-40 bg-white border-b border-gray-200 h-14 px-4 flex items-center justify-between"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="flex items-center gap-2">
        <div class="w-9 h-9 rounded-lg bg-brand-500 text-white text-base font-bold flex items-center justify-center">
          S
        </div>
        <div class="leading-tight">
          <div class="text-sm font-semibold text-gray-900">Sale Lite</div>
          <div class="text-[11px] text-gray-500">{{ userName }}</div>
        </div>
      </div>
      <button
        @click="handleLogout"
        class="text-sm text-gray-500 hover:text-rose-600 px-2 py-1 rounded transition"
        aria-label="Đăng xuất"
      >
        Đăng xuất
      </button>
    </header>

    <main class="flex-1 pb-20">
      <router-view />
    </main>

    <BottomNav />
  </div>
</template>
