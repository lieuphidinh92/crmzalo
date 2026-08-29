<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import { formatVND, statusLabel, statusColor } from '../../composables/useFormat';
import { useAuthStore } from '../../stores/auth';

defineProps({ rows: { type: Array, default: () => [] } });
const emit = defineEmits(['targets-updated']);
const router = useRouter();
const auth = useAuthStore();
const medals = ['🥇', '🥈', '🥉'];
const selected = ref(null);
const loadingOrders = ref(false);
const orderError = ref('');
const targetEditor = ref(null);
const savingTarget = ref(false);
const targetError = ref('');

async function openOrders(row) {
  if (!canOpenOrders(row)) return;
  selected.value = { sale: { id: row.saleId, fullName: row.name }, orders: [], count: row.orders, revenue: row.revenue };
  loadingOrders.value = true;
  orderError.value = '';
  try {
    const response = await api.get(`/sale-app/dashboard-v2/leaderboard/${row.saleId}/orders`);
    selected.value = response.data;
  } catch (error) {
    orderError.value = error.response?.data?.error || 'Không tải được danh sách đơn hàng';
  } finally {
    loadingOrders.value = false;
  }
}

function canOpenOrders(row) {
  return row.isMe
    || ['owner', 'admin'].includes(auth.user?.role)
    || auth.user?.canViewAllOrders === true;
}

function canManageTargets() {
  return ['owner', 'admin'].includes(auth.user?.role);
}

function openTarget(row) {
  const target = row.dashboardTarget || {};
  targetEditor.value = {
    saleId: row.saleId,
    name: row.name,
    revenue: target.revenue ?? '',
    activeCustomers: target.activeCustomers ?? '',
    orderFrequency: target.orderFrequency ?? '',
    averageOrderValue: target.averageOrderValue ?? '',
  };
  targetError.value = '';
}

async function saveTarget() {
  if (!targetEditor.value) return;
  savingTarget.value = true;
  targetError.value = '';
  try {
    await api.put(`/sale-app/dashboard-v2/targets/${targetEditor.value.saleId}`, {
      revenue: targetEditor.value.revenue || null,
      activeCustomers: targetEditor.value.activeCustomers || null,
      orderFrequency: targetEditor.value.orderFrequency || null,
      averageOrderValue: targetEditor.value.averageOrderValue || null,
    });
    targetEditor.value = null;
    emit('targets-updated');
  } catch (error) {
    targetError.value = error.response?.data?.error || 'Không lưu được KPI';
  } finally {
    savingTarget.value = false;
  }
}
</script>

<template>
  <section class="overflow-hidden rounded-card border border-line-200 bg-white shadow-card">
    <header class="flex items-center justify-between px-4 py-3 border-b border-line-200">
      <h2 class="text-sm font-bold text-ink-primary">LEADERBOARD (THÁNG NÀY)</h2>
      <button class="text-[10px] font-semibold text-royal-700" @click="router.push('/reports')">Xem tất cả</button>
    </header>
    <div v-if="!rows.length" class="p-8 text-center text-xs text-ink-secondary">Chưa phát sinh doanh số tháng này.</div>
    <div v-else class="divide-y divide-line-200">
      <div class="grid grid-cols-[28px_1fr_1fr_82px] items-center gap-2 bg-surface-50 px-4 py-2 text-[9px] font-semibold uppercase text-ink-secondary"><span>#</span><span>Sale</span><span class="text-right">Doanh số</span><span class="text-right">% target</span></div>
      <div v-for="row in rows" :key="row.saleId" class="grid grid-cols-[28px_1fr_1fr_82px] items-center gap-2 px-4 py-1.5" :class="row.isMe ? 'bg-royal-50/60' : ''">
        <div class="text-center text-sm">{{ medals[row.rank - 1] || row.rank }}</div>
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[9px] font-bold text-royal-700">{{ row.name.slice(0, 1) }}</span>
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-1">
              <button :disabled="!canOpenOrders(row)" :title="canOpenOrders(row) ? `Xem đơn hàng tháng của ${row.name}` : 'Bạn không có quyền xem đơn của nhân viên này'" class="min-w-0 truncate text-left text-[11px] font-semibold leading-4 text-ink-primary underline-offset-2 disabled:cursor-default enabled:hover:text-royal-700 enabled:hover:underline" @click="openOrders(row)">
                {{ row.name }} <span v-if="row.isMe" class="text-royal-700">(Bạn)</span>
              </button>
              <button v-if="canManageTargets()" title="Chỉnh KPI" class="shrink-0 text-[8px] font-semibold text-royal-700 hover:underline" @click="openTarget(row)">KPI</button>
            </div>
            <div class="text-[8px] leading-3 text-ink-secondary">{{ row.orders }} đơn · Bấm tên để xem</div>
          </div>
        </div>
        <div class="text-right text-xs font-bold tabular-nums text-ink-primary">{{ formatVND(row.revenue) }}</div>
        <div class="text-right">
          <div v-if="row.target" class="text-[10px] font-bold" :class="row.targetPercent >= 100 ? 'text-emerald-600' : 'text-ink-primary'">{{ row.targetPercent }}%</div>
          <div v-else class="text-[9px] text-ink-disabled">—</div>
          <div v-if="row.target" class="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-soft"><div class="h-full rounded-full bg-royal-600" :style="{ width: `${Math.min(100, row.targetPercent || 0)}%` }" /></div>
        </div>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="selected" class="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" @click.self="selected = null" @keydown.esc.window="selected = null">
      <section class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Danh sách đơn hàng trong tháng">
        <header class="flex items-start justify-between gap-4 border-b border-line-200 px-4 py-4 sm:px-5">
          <div>
            <h3 class="text-base font-bold text-ink-primary">Đơn hàng tháng của {{ selected.sale.fullName }}</h3>
            <p class="mt-1 text-xs text-ink-secondary">{{ selected.count }} đơn hợp lệ · {{ formatVND(selected.revenue) }}</p>
          </div>
          <button class="flex h-8 w-8 items-center justify-center rounded-lg border border-line-200 text-ink-secondary" aria-label="Đóng" @click="selected = null">×</button>
        </header>
        <div v-if="loadingOrders" class="p-10 text-center text-sm text-ink-secondary">Đang tải danh sách đơn hàng…</div>
        <div v-else-if="orderError" class="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ orderError }}</div>
        <div v-else-if="!selected.orders.length" class="p-10 text-center text-sm text-ink-secondary">Không có đơn hợp lệ trong tháng.</div>
        <div v-else class="overflow-auto">
          <div class="hidden grid-cols-[120px_1fr_110px_140px] gap-3 bg-surface-50 px-5 py-2.5 text-[10px] font-semibold uppercase text-ink-secondary sm:grid">
            <span>Mã đơn</span><span>Khách hàng</span><span>Ngày đơn</span><span class="text-right">Giá trị</span>
          </div>
          <button v-for="order in selected.orders" :key="order.id" class="grid w-full grid-cols-[1fr_auto] gap-2 border-b border-line-200 px-4 py-3 text-left hover:bg-royal-50/40 sm:grid-cols-[120px_1fr_110px_140px] sm:px-5" @click="router.push(`/orders/${order.id}`); selected = null">
            <span class="font-mono text-[11px] text-ink-secondary">{{ order.orderCode }}</span>
            <span class="min-w-0 truncate text-xs font-semibold text-ink-primary">{{ order.customerName }}</span>
            <span class="text-[11px] text-ink-secondary">{{ dayjs(order.orderDate).format('DD/MM/YYYY') }}</span>
            <span class="text-right"><strong class="text-xs tabular-nums text-ink-primary">{{ formatVND(order.totalAmount) }}</strong><br><span class="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px]" :class="statusColor(order.status)">{{ statusLabel(order.status) }}</span></span>
          </button>
        </div>
      </section>
    </div>

    <div v-if="targetEditor" class="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" @click.self="targetEditor = null" @keydown.esc.window="targetEditor = null">
      <form class="w-full max-w-lg rounded-t-2xl bg-white shadow-pop sm:rounded-2xl" @submit.prevent="saveTarget">
        <header class="flex items-start justify-between border-b border-line-200 px-5 py-4">
          <div><h3 class="text-base font-bold text-ink-primary">KPI tháng – {{ targetEditor.name }}</h3><p class="mt-1 text-xs text-ink-secondary">Để trống trường không áp dụng mục tiêu.</p></div>
          <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg border border-line-200" @click="targetEditor = null">×</button>
        </header>
        <div class="grid grid-cols-2 gap-4 p-5">
          <label class="col-span-2 text-xs font-semibold text-ink-primary">Doanh thu mục tiêu (đ)<input v-model="targetEditor.revenue" type="number" min="0" step="1000000" class="mt-1.5 h-10 w-full rounded-lg border border-line-200 px-3 font-normal" placeholder="600000000" /></label>
          <label class="text-xs font-semibold text-ink-primary">Khách Active<input v-model="targetEditor.activeCustomers" type="number" min="0" step="1" class="mt-1.5 h-10 w-full rounded-lg border border-line-200 px-3 font-normal" placeholder="75" /></label>
          <label class="text-xs font-semibold text-ink-primary">Tần suất/tháng<input v-model="targetEditor.orderFrequency" type="number" min="0" step="0.05" class="mt-1.5 h-10 w-full rounded-lg border border-line-200 px-3 font-normal" placeholder="1.5" /></label>
          <label class="col-span-2 text-xs font-semibold text-ink-primary">Giá trị đơn trung bình (đ)<input v-model="targetEditor.averageOrderValue" type="number" min="0" step="100000" class="mt-1.5 h-10 w-full rounded-lg border border-line-200 px-3 font-normal" placeholder="7500000" /></label>
          <div v-if="targetError" class="col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{{ targetError }}</div>
        </div>
        <footer class="flex justify-end gap-2 border-t border-line-200 px-5 py-4"><button type="button" class="h-9 rounded-lg border border-line-200 px-4 text-xs font-semibold" @click="targetEditor = null">Hủy</button><button type="submit" :disabled="savingTarget" class="h-9 rounded-lg bg-royal-700 px-4 text-xs font-semibold text-white disabled:opacity-50">{{ savingTarget ? 'Đang lưu…' : 'Lưu KPI' }}</button></footer>
      </form>
    </div>
  </Teleport>
</template>
