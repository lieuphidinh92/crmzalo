<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// 4 tab cố định (tab thứ 5 là nút "Xem thêm" mở bảng chức năng)
const sideTabs = [
  { name: 'home', label: 'Trang chủ', to: '/', icon: 'home' },
  { name: 'products', label: 'Sản phẩm', to: '/products', icon: 'box' },
  // [FAB "Tạo đơn" chèn giữa]
  { name: 'orders', label: 'Đơn hàng', to: '/orders', icon: 'receipt' },
];

// Các chức năng còn thiếu trên mobile — gom vào bảng "Xem thêm" (khớp Sidebar desktop)
const moreItems = computed(() => [
  { name: 'customers', label: 'Khách hàng', to: '/customers', icon: 'users' },
  { name: 'debt', label: 'Công nợ', to: '/debt', icon: 'wallet' },
  { name: 'follow-up', label: 'Cần chăm sóc', to: '/follow-up', icon: 'heart' },
  { name: 'inventory', label: 'Tồn kho', to: '/inventory', icon: 'warehouse' },
  { name: 'promo', label: 'Khuyến mãi', to: '/promotions', icon: 'badge', hot: true },
  { name: 'reports', label: 'Báo cáo', to: '/reports', icon: 'chart' },
  { name: 'settings', label: 'Cài đặt', to: '/settings', icon: 'cog' },
  { name: 'account', label: 'Tài khoản', to: '/account', icon: 'user' },
]);

const showMore = ref(false);

function go(to) {
  router.push(to);
}

function goMore(item) {
  showMore.value = false;
  router.push(item.to);
}

function isActive(to) {
  if (to === '/') return route.path === '/';
  return route.path.startsWith(to);
}

// Nút "Xem thêm" sáng khi đang ở 1 trong các trang trong bảng
const moreActive = computed(() =>
  moreItems.value.some((i) => isActive(i.to)),
);
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

      <!-- Tab 4: Đơn hàng -->
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
        <span class="text-[11px] font-medium leading-none mt-0.5">{{ tab.label }}</span>
      </button>

      <!-- Tab 5: Xem thêm (mở bảng chức năng) -->
      <button
        @click="showMore = true"
        class="flex flex-col items-center justify-center gap-0.5 transition"
        :class="moreActive || showMore ? 'text-royal-700' : 'text-ink-secondary'"
        aria-label="Xem thêm chức năng"
      >
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>
        </svg>
        <span class="text-[11px] font-medium leading-none mt-0.5">Xem thêm</span>
      </button>

      <!-- "Tạo đơn" label below FAB -->
      <div class="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
        <span class="text-[11px] font-medium leading-none text-royal-700">Tạo đơn</span>
      </div>
    </div>
  </nav>

  <!-- Bảng "Xem thêm" trồi từ dưới lên (chỉ mobile) -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showMore"
        class="lg:hidden fixed inset-0 z-50 bg-black/40"
        @click="showMore = false"
      />
    </Transition>
    <Transition name="sheet">
      <div
        v-if="showMore"
        class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl"
        style="padding-bottom: calc(env(safe-area-inset-bottom) + 12px)"
      >
        <!-- Grip + tiêu đề -->
        <div class="pt-3 pb-1 flex flex-col items-center">
          <div class="w-10 h-1 rounded-full bg-line-200"></div>
        </div>
        <div class="px-5 pt-1 pb-3 flex items-center justify-between">
          <h3 class="text-base font-bold text-ink-primary">Chức năng khác</h3>
          <button
            @click="showMore = false"
            class="w-8 h-8 rounded-full hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
            aria-label="Đóng"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Lưới chức năng -->
        <div class="px-4 pb-4 grid grid-cols-3 gap-2">
          <button
            v-for="item in moreItems"
            :key="item.name"
            @click="goMore(item)"
            class="relative flex flex-col items-center justify-center gap-2 py-4 rounded-xl transition active:scale-95"
            :class="isActive(item.to) ? 'bg-royal-50 text-royal-700' : 'bg-surface-soft text-ink-primary hover:bg-line-200'"
          >
            <!-- Badge góc -->
            <span v-if="item.hot" class="absolute top-1.5 right-1.5 text-[8px] font-bold uppercase bg-amber-500 text-white px-1 py-0.5 rounded leading-none">HOT</span>
            <span v-else-if="item.soon" class="absolute top-1.5 right-1.5 text-[8px] font-medium text-ink-secondary bg-line-200 px-1 py-0.5 rounded leading-none">Sắp có</span>

            <span
              class="w-11 h-11 rounded-full flex items-center justify-center"
              :class="isActive(item.to) ? 'bg-royal-700 text-white' : 'bg-white text-royal-700'"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <g v-if="item.icon === 'users'"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></g>
                <g v-else-if="item.icon === 'wallet'"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></g>
                <g v-else-if="item.icon === 'heart'"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></g>
                <g v-else-if="item.icon === 'warehouse'"><path d="M22 8.35V20a2 2 0 01-2 2H4a2 2 0 01-2-2V8.35a2 2 0 011.26-1.86l8-3.2a2 2 0 011.48 0l8 3.2A2 2 0 0122 8.35z"/><path d="M6 18h12M6 14h12M6 22V10"/></g>
                <g v-else-if="item.icon === 'badge'"><path d="M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76z"/><path d="M9 12l2 2 4-4"/></g>
                <g v-else-if="item.icon === 'chart'"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></g>
                <g v-else-if="item.icon === 'cog'"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></g>
                <g v-else-if="item.icon === 'user'"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></g>
              </svg>
            </span>
            <span class="text-[12px] font-medium leading-tight text-center px-1">{{ item.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
