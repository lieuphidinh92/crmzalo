<script setup>
import { computed } from 'vue';
import { formatVND, formatDateVN, tierLabel } from '../composables/useFormat';
import { canZaloRemind, openZaloReminder } from '../composables/useDebtReminder';

const props = defineProps({
  customer: { type: Object, required: true },
});
const emit = defineEmits(['open']);

const TYPE_LABEL = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Cửa hàng mẹ bé',
};

const initials = computed(() => {
  const name = props.customer.full_name || props.customer.store_name || '?';
  return name.trim().slice(0, 1).toUpperCase();
});
const typeLabel = computed(() => TYPE_LABEL[props.customer.customer_type] || null);
const isOverdue = computed(() => !!props.customer.is_overdue);

// Số ngày quá hạn (âm = còn hạn). Dựa trên due_date so với hôm nay.
const daysOverdue = computed(() => {
  if (!props.customer.due_date) return null;
  const due = new Date(props.customer.due_date);
  const diff = Math.floor((Date.now() - due.getTime()) / 86400000);
  return diff;
});

const dueBadge = computed(() => {
  if (!props.customer.due_date) {
    return { cls: 'bg-gray-100 text-gray-600', label: 'Không hạn' };
  }
  const d = daysOverdue.value;
  if (d > 0) return { cls: 'bg-rose-100 text-rose-700', label: `Quá hạn ${d} ngày` };
  if (d === 0) return { cls: 'bg-amber-100 text-amber-700', label: 'Đến hạn hôm nay' };
  return { cls: 'bg-emerald-50 text-emerald-700', label: `Hạn ${formatDateVN(props.customer.due_date)}` };
});

const canZalo = computed(() => canZaloRemind(props.customer));

// Mở Zalo + soạn sẵn tin nhắc thu nợ (dùng helper chung).
function openZalo() {
  openZaloReminder(props.customer);
}
</script>

<template>
  <div
    class="bg-white border rounded-card p-3.5 shadow-card flex gap-3"
    :class="isOverdue ? 'border-rose-200' : 'border-line-200'"
  >
    <!-- Avatar -->
    <button
      @click="emit('open', customer)"
      class="w-11 h-11 rounded-full bg-royal-50 text-royal-700 flex items-center justify-center font-bold shrink-0"
    >
      {{ initials }}
    </button>

    <button @click="emit('open', customer)" class="min-w-0 flex-1 text-left">
      <!-- Name + tier + due badge -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-semibold text-ink-primary truncate">{{ customer.full_name || '—' }}</span>
        <span
          v-if="customer.policy_tier"
          class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-royal-50 text-royal-700"
        >
          {{ tierLabel(customer.policy_tier) }}
        </span>
        <span class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="dueBadge.cls">
          {{ dueBadge.label }}
        </span>
      </div>

      <!-- Sub: store / phone / province -->
      <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
        <span v-if="customer.store_name" class="truncate">🏪 {{ customer.store_name }}</span>
        <span v-if="customer.phone">📞 {{ customer.phone }}</span>
        <span v-if="customer.province">📍 {{ customer.province }}</span>
      </div>

      <!-- Debt row -->
      <div class="flex items-center gap-3 mt-2 text-[11px] flex-wrap">
        <span v-if="typeLabel" class="text-ink-secondary">{{ typeLabel }}</span>
        <span class="text-ink-secondary">
          {{ customer.order_count || 0 }} đơn nợ
          <template v-if="customer.overdue_orders">· {{ customer.overdue_orders }} quá hạn</template>
        </span>
        <span class="font-bold tabular-nums" :class="isOverdue ? 'text-rose-600' : 'text-ink-primary'">
          Nợ {{ formatVND(customer.debt || 0) }}
        </span>
      </div>
    </button>

    <!-- Action -->
    <div class="shrink-0 flex items-center">
      <button
        @click="openZalo"
        :disabled="!canZalo"
        class="h-9 px-3 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-xs font-semibold shadow-pop flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        :title="canZalo ? 'Mở Zalo và soạn tin nhắc thu nợ' : 'KH chưa có Zalo / SĐT'"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        Nhắc thu
      </button>
    </div>
  </div>
</template>
