<script setup>
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const sideTabs = [
  { name: 'home', label: 'Trang chủ', to: '/', icon: 'home' },
  { name: 'products', label: 'Sản phẩm', to: '/products', icon: 'box' },
  // [fab inserted between index 1 and 2]
  { name: 'orders', label: 'Đơn hàng', to: '/orders', icon: 'receipt' },
  { name: 'account', label: 'Tài khoản', to: '/account', icon: 'user' },
];

function go(to) {
  router.push(to);
}

function isActive(to) {
  if (to === '/') return route.path === '/';
  return route.path.startsWith(to);
}
</script>

<template>
  <nav
    class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-line-200"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <div class="grid grid-cols-5 h-16 relative">
      <!-- Tab 1 + 2 -->
      <button
        v-for="tab in sideTabs.slice(0, 2)"
        :key="tab.name"
        @click="go(tab.to)"
        class="flex flex-col items-center justify-center gap-0.5 transition"
        :class="isActive(tab.to) ? 'text-royal-700' : 'text-ink-secondary'"
      >
        <svg v-if="tab.icon === 'home'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10"/>
        </svg>
        <svg v-if="tab.icon === 'box'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12l8.73-5.04M12 22V12"/>
        </svg>
        <span class="text-[11px] font-medium leading-none mt-0.5">{{ tab.label }}</span>
      </button>

      <!-- Center FAB Tạo đơn (lifted) -->
      <div class="flex items-start justify-center">
        <button
          @click="go('/pos')"
          class="-mt-6 w-14 h-14 rounded-full bg-royal-700 hover:bg-royal-800 active:bg-royal-800 text-white flex items-center justify-center shadow-fab transition relative"
          :class="isActive('/pos') ? 'ring-4 ring-royal-100' : ''"
          aria-label="Tạo đơn"
        >
          <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
        </button>
      </div>

      <!-- Tab 4 + 5 -->
      <button
        v-for="tab in sideTabs.slice(2)"
        :key="tab.name"
        @click="go(tab.to)"
        class="flex flex-col items-center justify-center gap-0.5 transition"
        :class="isActive(tab.to) ? 'text-royal-700' : 'text-ink-secondary'"
      >
        <svg v-if="tab.icon === 'receipt'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h8m-8 4h6"/>
        </svg>
        <svg v-if="tab.icon === 'user'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
        <span class="text-[11px] font-medium leading-none mt-0.5">{{ tab.label }}</span>
      </button>

      <!-- "Tạo đơn" label below FAB -->
      <div class="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
        <span class="text-[11px] font-medium leading-none text-royal-700">Tạo đơn</span>
      </div>
    </div>
  </nav>
</template>
