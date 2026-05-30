<script setup>
import { computed } from 'vue';
import { formatVND, formatVNDShort, formatRelativeTime, tierLabel } from '../composables/useFormat';

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
const hasDebt = computed(() => (props.customer.debt ?? 0) > 0);
</script>

<template>
  <button
    @click="emit('open', customer)"
    class="w-full text-left bg-white border border-line-200 rounded-card p-3.5 shadow-card hover:border-royal-700 hover:shadow-pop transition flex gap-3"
  >
    <!-- Avatar -->
    <div class="w-11 h-11 rounded-full bg-royal-50 text-royal-700 flex items-center justify-center font-bold shrink-0">
      {{ initials }}
    </div>

    <div class="min-w-0 flex-1">
      <!-- Name + tier -->
      <div class="flex items-center gap-2">
        <span class="font-semibold text-ink-primary truncate">{{ customer.full_name || '—' }}</span>
        <span
          v-if="customer.policy_tier"
          class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-royal-50 text-royal-700"
        >
          {{ tierLabel(customer.policy_tier) }}
        </span>
      </div>

      <!-- Sub: store / phone / province -->
      <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
        <span v-if="customer.store_name" class="truncate">🏪 {{ customer.store_name }}</span>
        <span v-if="customer.phone">📞 {{ customer.phone }}</span>
        <span v-if="customer.province">📍 {{ customer.province }}</span>
      </div>

      <!-- Stats row -->
      <div class="flex items-center gap-3 mt-2 text-[11px]">
        <span v-if="typeLabel" class="text-ink-secondary">{{ typeLabel }}</span>
        <span class="text-ink-secondary">
          {{ customer.order_count || 0 }} đơn · {{ formatVNDShort(customer.total_revenue || 0) }}
        </span>
        <span
          v-if="hasDebt"
          class="ml-auto font-semibold text-red-600 tabular-nums"
        >
          Nợ {{ formatVND(customer.debt) }}
        </span>
        <span v-else class="ml-auto text-ink-disabled">
          {{ customer.last_order_date ? formatRelativeTime(customer.last_order_date) : 'Chưa mua' }}
        </span>
      </div>
    </div>
  </button>
</template>
