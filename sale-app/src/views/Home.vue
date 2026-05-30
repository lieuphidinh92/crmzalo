<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatDateTimeVN, statusLabel, statusColor } from '../composables/useFormat';
import KpiCard from '../components/KpiCard.vue';
import PromotionBanner from '../components/PromotionBanner.vue';

dayjs.locale('vi');

const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const errorMsg = ref('');
const stats = ref(null);
const topProducts = ref([]);
const lowStock = ref([]);

const userName = computed(() => auth.user?.fullName || auth.user?.email || 'Sale');
const today = computed(() => {
  const d = dayjs();
  const weekday = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.day()];
  return `${weekday}, ${d.format('DD/MM/YYYY')}`;
});

const processingOrders = computed(
  () => (stats.value?.recent_orders ?? []).filter((o) => o.status !== 'completed' && o.status !== 'cancelled'),
);

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [s, tp, ls] = await Promise.all([
      api.get('/sale-app/home-stats'),
      api.get('/sale-app/top-products', { params: { limit: 5 } }).catch(() => ({ data: { products: [] } })),
      api.get('/sale-app/low-stock', { params: { limit: 4 } }).catch(() => ({ data: { products: [] } })),
    ]);
    stats.value = s.data;
    topProducts.value = tp.data.products || [];
    lowStock.value = ls.data.products || [];
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được dữ liệu';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const quickActions = [
  { label: 'Tạo đơn hàng', sub: 'Lên đơn nhanh', icon: 'cart', to: '/pos' },
  { label: 'Báo giá nhanh', sub: 'Tạo báo giá gửi KH', icon: 'doc', soon: true },
  { label: 'Kho hàng', sub: 'Kiểm tra tồn kho', icon: 'warehouse', soon: true },
  { label: 'Khuyến mãi', sub: 'Chương trình hiện có', icon: 'gift', soon: true },
  { label: 'Khách hàng', sub: 'Tìm và tạo mới', icon: 'users', soon: true },
  { label: 'Sản phẩm mới', sub: 'SP vừa cập nhật', icon: 'box', soon: true },
];

const trustPills = [
  { icon: 'shield', title: 'Hàng chính hãng', sub: 'Cam kết 100% chính hãng' },
  { icon: 'tag', title: 'Giá tốt nhất', sub: 'Chiết khấu cao, cạnh tranh' },
  { icon: 'truck', title: 'Giao hàng nhanh', sub: 'Giao toàn quốc 24–48h' },
  { icon: 'heart', title: 'Hỗ trợ tận tâm', sub: 'Đội ngũ hỗ trợ 24/7' },
];

function quickGo(a) {
  if (a.soon) return;
  if (a.to) router.push(a.to);
}

function levelBadge(l) {
  if (l === 'out') return { label: 'Hết hàng', cls: 'bg-red-50 text-red-700' };
  if (l === 'critical') return { label: 'Sắp hết', cls: 'bg-red-50 text-red-700' };
  return { label: 'Thấp', cls: 'bg-amber-50 text-amber-700' };
}
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1280px] mx-auto">
    <!-- Greeting -->
    <div class="mb-5">
      <div class="text-xl lg:text-2xl font-bold text-ink-primary">
        Xin chào, {{ userName }} 👋
      </div>
      <div class="text-sm text-ink-secondary mt-0.5">Hôm nay là {{ today }}</div>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div v-for="i in 4" :key="i" class="h-24 bg-white rounded-card border border-line-200 animate-pulse"></div>
      </div>
      <div class="h-40 bg-white rounded-card border border-line-200 animate-pulse"></div>
    </div>

    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <template v-else-if="stats">
      <!-- KPI row -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Doanh số hôm nay"
          :value="formatVND(stats.today.revenue)"
          icon="trending-up"
          iconColor="royal"
        />
        <KpiCard
          label="Doanh số tháng"
          :value="formatVND(stats.this_month.revenue)"
          icon="coins"
          iconColor="amber"
        />
        <KpiCard
          label="Số đơn hôm nay"
          :value="`${stats.today.order_count} đơn`"
          icon="shopping-bag"
          iconColor="green"
        />
        <KpiCard
          label="Công nợ hiện tại"
          value="—"
          action="Xem chi tiết"
          icon="dollar-circle"
          iconColor="red"
        />
      </div>

      <!-- Promotion banner + Low stock alerts -->
      <div class="grid lg:grid-cols-3 gap-5 mb-5">
        <div class="lg:col-span-2">
          <PromotionBanner />
        </div>
        <div class="bg-white border border-line-200 rounded-card p-5 shadow-card">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-ink-primary">Cảnh báo tồn kho</div>
            <button class="text-xs text-royal-700 hover:underline font-medium opacity-50 cursor-not-allowed">
              Xem tất cả
            </button>
          </div>
          <div v-if="lowStock.length === 0" class="text-xs text-ink-secondary py-6 text-center">
            Không có cảnh báo
          </div>
          <ul v-else class="space-y-2.5">
            <li v-for="p in lowStock" :key="p.id" class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-surface-50 border border-line-200 flex items-center justify-center text-ink-disabled shrink-0 overflow-hidden">
                <img v-if="p.mainImageUrl" :src="p.mainImageUrl" :alt="p.name" class="w-full h-full object-cover" />
                <span v-else class="text-[10px]">{{ p.sku.slice(0, 3) }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-ink-primary truncate">{{ p.name }}</div>
                <div class="text-[11px] text-ink-secondary">Tồn kho: {{ p.stock }} {{ p.unit }}</div>
              </div>
              <span
                class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded shrink-0"
                :class="levelBadge(p.level).cls"
              >
                {{ levelBadge(p.level).label }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Top SP + Đơn đang xử lý -->
      <div class="grid lg:grid-cols-3 gap-5 mb-5">
        <div class="lg:col-span-2 bg-white border border-line-200 rounded-card p-5 shadow-card">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-ink-primary">Top sản phẩm bán chạy</div>
            <button class="text-xs text-royal-700 hover:underline font-medium opacity-50 cursor-not-allowed">
              Xem tất cả
            </button>
          </div>
          <div v-if="topProducts.length === 0" class="text-xs text-ink-secondary py-6 text-center">
            Chưa có dữ liệu tháng này
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button
              v-for="(p, idx) in topProducts"
              :key="p.id"
              @click="router.push('/pos')"
              class="text-left group"
            >
              <div class="relative aspect-square rounded-lg bg-surface-50 border border-line-200 overflow-hidden mb-2">
                <img v-if="p.mainImageUrl" :src="p.mainImageUrl" :alt="p.name" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-ink-disabled text-xs">{{ p.sku }}</div>
                <span
                  class="absolute top-1.5 left-1.5 w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center shadow-pop"
                  :class="idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-orange-700' : 'bg-royal-700'"
                >
                  {{ idx + 1 }}
                </span>
              </div>
              <div class="text-xs font-medium text-ink-primary line-clamp-2 leading-snug">{{ p.name }}</div>
              <div class="text-[10px] text-ink-secondary mt-1">Đã bán: {{ p.quantitySold }} {{ p.unit }}</div>
              <div class="text-sm font-bold text-royal-700 mt-1">{{ formatVND(p.wholesale_price) }}</div>
              <div v-if="p.estimated_profit > 0" class="text-[10px] text-green-700">
                Lãi dự kiến: {{ formatVND(p.estimated_profit) }}
              </div>
            </button>
          </div>
        </div>

        <div class="bg-white border border-line-200 rounded-card p-5 shadow-card">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-ink-primary">Đơn đang xử lý</div>
            <button class="text-xs text-royal-700 hover:underline font-medium opacity-50 cursor-not-allowed">
              Xem tất cả
            </button>
          </div>
          <div v-if="processingOrders.length === 0" class="text-xs text-ink-secondary py-6 text-center">
            Không có đơn đang xử lý
          </div>
          <ul v-else class="space-y-2.5">
            <li v-for="o in processingOrders" :key="o.id" class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-[11px] font-mono text-ink-secondary">{{ o.order_code }}</div>
                <div class="text-sm font-medium text-ink-primary truncate">{{ o.contact_name }}</div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-sm font-bold text-ink-primary">{{ formatVND(o.total_amount) }}</div>
                <span
                  class="inline-block text-[10px] uppercase font-semibold px-2 py-0.5 rounded mt-0.5"
                  :class="statusColor(o.status)"
                >
                  {{ statusLabel(o.status) }}
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-5">
        <div class="text-sm font-semibold text-ink-primary mb-3">Công cụ bán hàng nhanh</div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            v-for="a in quickActions"
            :key="a.label"
            @click="quickGo(a)"
            :disabled="a.soon"
            class="border border-line-200 rounded-lg p-3 text-left transition relative"
            :class="
              a.soon
                ? 'bg-surface-50 cursor-not-allowed opacity-60'
                : 'bg-white hover:border-royal-700 hover:shadow-card'
            "
          >
            <div class="w-9 h-9 rounded-lg bg-royal-50 text-royal-700 flex items-center justify-center mb-2">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path v-if="a.icon === 'cart'" stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.4 6M7 13l2.4 6"/>
                <path v-if="a.icon === 'doc'" stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                <path v-if="a.icon === 'warehouse'" stroke-linecap="round" stroke-linejoin="round" d="M19 21V11.5M5 21V11.5M3 11l9-7 9 7M3 21h18M9 21v-6h6v6"/>
                <path v-if="a.icon === 'gift'" stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zM5 12V8h14v4M5 12v9h14v-9"/>
                <path v-if="a.icon === 'users'" stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path v-if="a.icon === 'box'" stroke-linecap="round" stroke-linejoin="round" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM12 22V12"/>
              </svg>
            </div>
            <div class="text-sm font-semibold text-ink-primary leading-tight">{{ a.label }}</div>
            <div class="text-[11px] text-ink-secondary mt-0.5">{{ a.sub }}</div>
            <span v-if="a.soon" class="absolute top-2 right-2 text-[9px] bg-line-200 text-ink-secondary px-1.5 py-0.5 rounded">
              Sắp có
            </span>
          </button>
        </div>
      </div>

      <!-- Trust strip -->
      <div class="rounded-card text-white p-5 shadow-card" style="background: linear-gradient(135deg, #0A2540 0%, #1E40AF 100%)">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div v-for="t in trustPills" :key="t.title" class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-amber-500 shrink-0">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path v-if="t.icon === 'shield'" stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                <path v-if="t.icon === 'tag'" stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                <path v-if="t.icon === 'truck'" stroke-linecap="round" stroke-linejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"/>
                <path v-if="t.icon === 'heart'" stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
              </svg>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold">{{ t.title }}</div>
              <div class="text-[11px] text-slate-300">{{ t.sub }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
