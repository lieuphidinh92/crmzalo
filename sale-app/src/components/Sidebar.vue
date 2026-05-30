<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const userName = computed(() => auth.user?.fullName || auth.user?.email || 'Sale');
const userRole = computed(() => {
  const team = auth.user?.team?.name;
  if (team) return team;
  const role = auth.user?.role;
  if (role === 'owner') return 'Chủ doanh nghiệp';
  if (role === 'admin') return 'Quản lý';
  return 'Sale Team';
});

const debtSummary = ref(null);
async function loadDebt() {
  try {
    const { data } = await api.get('/sale-app/debt-summary');
    debtSummary.value = data;
  } catch {
    debtSummary.value = null;
  }
}
onMounted(loadDebt);

const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const navItems = computed(() => [
  { name: 'home', label: 'Tổng quan', to: '/', icon: 'home' },
  { name: 'products', label: 'Sản phẩm', to: '/products', icon: 'package', soon: true },
  { name: 'create', label: 'Tạo đơn hàng', to: '/pos', icon: 'cart' },
  { name: 'orders', label: 'Đơn hàng', to: '/orders', icon: 'clipboard', soon: true },
  { name: 'customers', label: 'Khách hàng', to: '/customers', icon: 'users' },
  { name: 'inventory', label: 'Tồn kho', to: '/inventory', icon: 'warehouse', soon: true },
  { name: 'promo', label: 'Khuyến mãi', to: '/promotions', icon: 'badge', hot: true, soon: true },
  { name: 'reports', label: 'Báo cáo', to: '/reports', icon: 'chart', soon: true },
  { name: 'settings', label: 'Cài đặt', to: '/settings', icon: 'cog', soon: !isAdmin.value },
]);

function isActive(to) {
  if (to === '/') return route.path === '/';
  return route.path.startsWith(to);
}
function go(item) {
  router.push(item.to);
}
</script>

<template>
  <aside
    class="hidden lg:flex w-[260px] shrink-0 text-white flex-col sticky top-0"
    style="height: 100dvh; background: linear-gradient(180deg, #0A2540 0%, #08213A 100%)"
  >
    <!-- Brand (88px area) -->
    <div class="h-[88px] px-5 flex items-center gap-3 border-b border-white/5">
      <div class="w-10 h-10 rounded-xl bg-royal-700 flex items-center justify-center text-white text-sm font-bold shadow-fab">
        ND
      </div>
      <div class="leading-tight">
        <div class="font-semibold text-[15px]">ngheduocsi.vn</div>
        <div class="text-[10px] text-slate-400">Nền tảng bán sỉ chính hãng</div>
      </div>
    </div>

    <!-- Nav -->
    <nav class="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      <button
        v-for="item in navItems"
        :key="item.name"
        @click="go(item)"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition"
        :class="[
          isActive(item.to)
            ? 'bg-royal-700 text-white shadow-fab'
            : 'text-slate-300 hover:bg-white/5 hover:text-white',
        ]"
      >
        <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <!-- Lucide-style icons -->
          <g v-if="item.icon === 'home'"><path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10"/></g>
          <g v-else-if="item.icon === 'package'"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12l8.73-5.04M12 22V12"/></g>
          <g v-else-if="item.icon === 'cart'"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></g>
          <g v-else-if="item.icon === 'clipboard'"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></g>
          <g v-else-if="item.icon === 'users'"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></g>
          <g v-else-if="item.icon === 'warehouse'"><path d="M22 8.35V20a2 2 0 01-2 2H4a2 2 0 01-2-2V8.35a2 2 0 011.26-1.86l8-3.2a2 2 0 011.48 0l8 3.2A2 2 0 0122 8.35z"/><path d="M6 18h12M6 14h12M6 22V10"/></g>
          <g v-else-if="item.icon === 'badge'"><path d="M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76z"/><path d="M9 12l2 2 4-4"/></g>
          <g v-else-if="item.icon === 'chart'"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></g>
          <g v-else-if="item.icon === 'cog'"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></g>
        </svg>
        <span class="flex-1 text-left">{{ item.label }}</span>
        <span v-if="item.hot" class="text-[9px] font-bold uppercase bg-amber-500 text-navy-900 px-1.5 py-0.5 rounded">HOT</span>
        <span v-else-if="item.soon" class="text-[9px] font-medium text-slate-500">Sắp có</span>
      </button>
    </nav>

    <!-- Bottom: profile + debt + support -->
    <div class="border-t border-white/5 px-3 py-3 space-y-2">
      <!-- User profile -->
      <button
        @click="auth.logout()"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition text-left"
      >
        <div class="w-10 h-10 rounded-full bg-royal-700 flex items-center justify-center text-white text-sm font-semibold shrink-0">
          {{ (userName || 'S').slice(0, 1).toUpperCase() }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">{{ userName }}</div>
          <div class="text-[11px] text-slate-400 truncate">{{ userRole }}</div>
        </div>
        <svg class="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      <!-- Total debt card -->
      <div class="w-full px-3 py-2.5 rounded-xl bg-white/5">
        <div class="flex items-center justify-between">
          <div class="text-[11px] text-slate-400">Công nợ tổng</div>
          <span v-if="debtSummary?.overdue_total > 0" class="text-[9px] font-bold uppercase bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">
            Quá hạn
          </span>
        </div>
        <div class="text-lg font-bold mt-0.5 tabular-nums">
          {{ debtSummary == null ? '—' : formatVND(debtSummary.total) }}
        </div>
        <div v-if="debtSummary?.order_count > 0" class="text-[10px] text-slate-500 mt-0.5">
          {{ debtSummary.order_count }} đơn · {{ debtSummary.contact_count }} KH
        </div>
        <div v-else-if="debtSummary" class="text-[10px] text-slate-500 mt-0.5">Không có công nợ</div>
      </div>

      <!-- Support card -->
      <div class="px-3 py-2.5 rounded-xl bg-white/5">
        <div class="flex items-center gap-2 mb-1">
          <svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h.01M12 12h.01M15 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <span class="text-[11px] text-slate-400">Cần hỗ trợ?</span>
        </div>
        <a href="tel:1900636925" class="text-sm font-bold text-amber-500 hover:underline">1900 636 925</a>
        <div class="text-[10px] text-slate-500 mt-0.5">8:00 – 17:30 (T2 – T7)</div>
      </div>
    </div>
  </aside>
</template>
