<script setup>
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { name: 'home', label: 'Trang chủ', icon: 'home', to: '/' },
  { name: 'pos', label: 'Bán hàng', icon: 'cart', to: '/pos' },
  { name: 'inventory', label: 'Tồn kho', icon: 'box', disabled: true },
  { name: 'me', label: 'Tôi', icon: 'user', disabled: true },
];

function go(tab) {
  if (tab.disabled) return;
  router.push(tab.to);
}

function isActive(tab) {
  if (tab.disabled) return false;
  return route.path === tab.to;
}
</script>

<template>
  <nav
    class="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 grid grid-cols-4"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.name"
      @click="go(tab)"
      :disabled="tab.disabled"
      class="h-16 flex flex-col items-center justify-center gap-0.5 transition relative"
      :class="[
        isActive(tab) ? 'text-brand-500' : 'text-gray-500',
        tab.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:text-brand-500',
      ]"
    >
      <svg v-if="tab.icon === 'home'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10"/>
      </svg>
      <svg v-if="tab.icon === 'cart'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.4 6M7 13l2.4 6M9 21a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z"/>
      </svg>
      <svg v-if="tab.icon === 'box'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12l8.73-5.04M12 22V12"/>
      </svg>
      <svg v-if="tab.icon === 'user'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
      </svg>
      <span class="text-[11px] leading-none mt-0.5 font-medium">
        {{ tab.label }}
      </span>
      <span v-if="tab.disabled" class="absolute top-1 right-1 text-[8px] bg-gray-200 text-gray-600 px-1 rounded">
        Sắp có
      </span>
    </button>
  </nav>
</template>
