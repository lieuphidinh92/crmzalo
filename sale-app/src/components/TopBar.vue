<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const searchQuery = ref('');

const userName = computed(() => auth.user?.fullName || auth.user?.email || 'Sale');

// Phase 2 placeholder counts — wired to real endpoints in Phase 3.
const pendingOrders = ref(0);
const notifications = ref(0);

function handleLogout() {
  if (confirm('Đăng xuất?')) auth.logout();
}
</script>

<template>
  <header
    class="sticky top-0 z-30 bg-white border-b border-line-200"
    style="padding-top: env(safe-area-inset-top)"
  >
    <!-- Mobile header -->
    <div class="lg:hidden h-14 px-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-9 h-9 rounded-lg bg-royal-700 text-white text-xs font-bold flex items-center justify-center">
          ND
        </div>
        <div class="leading-tight">
          <div class="text-sm font-semibold text-ink-primary">ngheduocsi.vn</div>
          <div class="text-[10px] text-ink-secondary">Bán sỉ chính hãng</div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button class="relative w-10 h-10 flex items-center justify-center text-ink-secondary hover:text-ink-primary" aria-label="Thông báo">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
          </svg>
          <span v-if="notifications > 0" class="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ notifications }}
          </span>
        </button>
        <button class="relative w-10 h-10 flex items-center justify-center text-ink-secondary hover:text-ink-primary" aria-label="Đơn chờ">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.4 6M7 13l2.4 6M9 21a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z"/>
          </svg>
          <span v-if="pendingOrders > 0" class="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ pendingOrders }}
          </span>
        </button>
      </div>
    </div>

    <!-- Desktop header (72px per spec) -->
    <div class="hidden lg:flex h-[72px] px-6 items-center gap-4">
      <div class="relative flex-1 max-w-[520px]">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Tìm sản phẩm, khách hàng, đơn hàng..."
          class="w-full h-11 pl-11 pr-3 rounded-input bg-surface-soft border border-transparent focus:bg-white focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
        />
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <button class="relative h-11 px-3 rounded-btn hover:bg-surface-soft flex items-center gap-2 text-sm text-ink-primary transition">
          <!-- Gift icon (Lucide) -->
          <svg class="w-5 h-5 text-royal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 12 20 22 4 22 4 12"/>
            <rect x="2" y="7" width="20" height="5"/>
            <line x1="12" y1="22" x2="12" y2="7"/>
            <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
          </svg>
          <span class="font-medium">Đơn chờ</span>
          <span v-if="pendingOrders > 0" class="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ pendingOrders }}
          </span>
        </button>
        <button class="relative h-11 px-3 rounded-btn hover:bg-surface-soft flex items-center gap-2 text-sm text-ink-primary transition">
          <svg class="w-5 h-5 text-royal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span class="font-medium">Thông báo</span>
          <span v-if="notifications > 0" class="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ notifications }}
          </span>
        </button>
        <div class="w-px h-6 bg-line-200 mx-1"></div>
        <button
          @click="handleLogout"
          class="text-sm text-ink-secondary hover:text-red-600 px-3 transition"
        >
          {{ userName }} · Đăng xuất
        </button>
      </div>
    </div>
  </header>
</template>
