<script setup>
import { ref } from 'vue';
import CustomerSearch from './CustomerSearch.vue';
import { usePOSStore } from '../stores/pos';
import { formatVND, formatDateVN, statusLabel, statusColor } from '../composables/useFormat';

const pos = usePOSStore();
const emit = defineEmits(['create-new']);

// Nhãn cấp giá (badge + nhóm giá + selector).
const TIERS = [
  { value: 'thung_10', label: '10 thùng' },
  { value: 'thung_5', label: '5 thùng' },
  { value: 'thung_1', label: '1 thùng' },
  { value: 'le', label: '<1 thùng' },
];
const LEGACY_TIER = { dai_ly_cap_2: 'thung_5', dai_ly_cap_1: 'thung_1', ctv: 'le' };
function tierLabelOf(t) {
  const key = LEGACY_TIER[t] || t;
  return TIERS.find((x) => x.value === key)?.label ?? '—';
}

// Tên NV phụ trách — thử các shape khác nhau từ search vs detail.
function assignedName() {
  return (
    pos.selectedCustomer?.assignedUser?.fullName ||
    pos.selectedCustomer?.assigned_user?.name ||
    pos.customerDetail?.assigned_user?.name ||
    null
  );
}

// --- focusSearch cho phím tắt Ctrl+K ở màn cha ---
const searchRef = ref(null);
const rootRef = ref(null);
function focusSearch() {
  if (pos.selectedCustomer) return; // đã chọn KH → không có ô tìm
  const c = searchRef.value;
  if (c?.focus) {
    c.focus();
    return;
  }
  // Fallback: focus input bên trong CustomerSearch.
  const input = rootRef.value?.querySelector('input');
  input?.focus();
}
defineExpose({ focusSearch });
</script>

<template>
  <div ref="rootRef" class="flex flex-col gap-4">
    <!-- TRẠNG THÁI 1: chưa chọn KH → ô tìm + tạo mới -->
    <template v-if="!pos.selectedCustomer">
      <CustomerSearch
        ref="searchRef"
        @select="pos.selectCustomer($event)"
        @create-new="emit('create-new')"
      />
      <div class="text-xs text-ink-disabled">
        Tìm khách hàng theo tên, SĐT hoặc mã KH để bắt đầu tạo đơn.
      </div>
    </template>

    <!-- TRẠNG THÁI 2: đã chọn KH → card giàu thông tin -->
    <template v-else>
      <div class="bg-white border border-line-200 rounded-xl p-4 flex flex-col gap-4">
        <!-- Header: tên + badge cấp + nút bỏ chọn -->
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-ink-primary truncate">
                {{ pos.selectedCustomer.fullName }}
              </span>
              <span
                class="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-royal-100 text-royal-700"
              >
                {{ tierLabelOf(pos.selectedTier) }}
              </span>
            </div>
            <div class="text-xs text-ink-secondary mt-1 space-y-0.5">
              <div v-if="pos.selectedCustomer.phone">📞 {{ pos.selectedCustomer.phone }}</div>
              <div v-if="pos.selectedCustomer.address || pos.selectedCustomer.province">
                📍
                <span>{{ pos.selectedCustomer.address }}</span>
                <span v-if="pos.selectedCustomer.province">
                  {{ pos.selectedCustomer.address ? '· ' : '' }}{{ pos.selectedCustomer.province }}
                </span>
              </div>
            </div>
          </div>
          <button
            @click="pos.clearCustomer()"
            type="button"
            class="text-ink-disabled hover:text-red-600 text-sm shrink-0 leading-none p-1"
            title="Bỏ chọn KH"
          >
            ✕
          </button>
        </div>

        <!-- NV phụ trách -->
        <div class="text-xs text-ink-secondary">
          NV phụ trách:
          <span class="text-ink-primary font-medium">{{ assignedName() || '—' }}</span>
        </div>

        <!-- Khối: Công nợ | Hạn mức -->
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-surface-50 border border-line-200 p-2.5">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">Công nợ hiện tại</div>
            <div v-if="pos.customerDetail" class="mt-0.5 font-semibold text-red-600">
              {{ formatVND(pos.customerDetail?.stats?.current_debt ?? 0) }}
            </div>
            <div v-else class="mt-1 h-4 w-20 rounded bg-line-200 animate-pulse"></div>
          </div>
          <div class="rounded-lg bg-surface-50 border border-line-200 p-2.5">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">Hạn mức</div>
            <div v-if="pos.customerDetail" class="mt-0.5 font-semibold text-ink-primary">
              <template v-if="pos.customerDetail?.credit_limit != null">
                {{ formatVND(pos.customerDetail.credit_limit) }}
              </template>
              <span v-else class="text-ink-disabled font-normal">Chưa đặt</span>
            </div>
            <div v-else class="mt-1 h-4 w-20 rounded bg-line-200 animate-pulse"></div>
          </div>
        </div>

        <!-- Khối: Nhóm giá | Điểm tích lũy -->
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-surface-50 border border-line-200 p-2.5">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">Nhóm giá</div>
            <div class="mt-0.5 font-semibold text-ink-primary">{{ tierLabelOf(pos.selectedTier) }}</div>
          </div>
          <div class="rounded-lg bg-surface-50 border border-line-200 p-2.5">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">Điểm tích lũy</div>
            <div v-if="pos.customerDetail" class="mt-0.5 font-semibold text-emerald-600">
              {{
                (
                  pos.customerDetail?.reward_points ??
                  pos.selectedCustomer.rewardPoints ??
                  0
                ).toLocaleString('vi-VN')
              }}
            </div>
            <div v-else class="mt-1 h-4 w-16 rounded bg-line-200 animate-pulse"></div>
          </div>
        </div>

        <!-- Selector cấp giá -->
        <div>
          <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5">Bảng giá</div>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="t in TIERS"
              :key="t.value"
              @click="pos.changeTier(t.value)"
              type="button"
              class="text-xs font-medium px-2 py-1.5 rounded-lg border transition"
              :class="
                pos.selectedTier === t.value
                  ? 'bg-royal-700 text-white border-royal-700'
                  : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
              "
            >
              {{ t.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Đơn hàng gần nhất -->
      <div class="bg-white border border-line-200 rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-ink-primary">Đơn hàng gần nhất</h3>
          <button
            type="button"
            class="text-xs text-royal-700 hover:text-royal-800 font-medium"
          >
            Xem tất cả
          </button>
        </div>

        <!-- Skeleton lúc đang tải -->
        <div v-if="!pos.customerDetail" class="space-y-2">
          <div v-for="i in 3" :key="i" class="h-10 rounded-lg bg-line-200 animate-pulse"></div>
        </div>

        <!-- Có đơn -->
        <ul
          v-else-if="(pos.customerDetail?.orders?.length || 0) > 0"
          class="divide-y divide-line-200"
        >
          <li
            v-for="o in pos.customerDetail.orders.slice(0, 5)"
            :key="o.order_code || o.id"
            class="py-2 flex items-center justify-between gap-2"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium text-ink-primary truncate">
                {{ o.order_code || '—' }}
              </div>
              <div class="text-xs text-ink-secondary">{{ formatDateVN(o.order_date) }}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm font-medium text-ink-primary">
                {{ formatVND(o.total_amount) }}
              </div>
              <span
                class="inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded-full"
                :class="statusColor(o.status)"
              >
                {{ statusLabel(o.status) }}
              </span>
            </div>
          </li>
        </ul>

        <!-- Chưa có đơn -->
        <div v-else class="text-sm text-ink-disabled py-2">Chưa có đơn</div>
      </div>
    </template>
  </div>
</template>
