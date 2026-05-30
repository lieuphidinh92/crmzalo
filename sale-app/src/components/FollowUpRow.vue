<script setup>
import { computed } from 'vue';
import { formatVNDShort, formatDateVN, tierLabel } from '../composables/useFormat';

const props = defineProps({
  customer: { type: Object, required: true },
});

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
const days = computed(() => props.customer.days_since_last_order ?? 0);

// Mức cảnh báo theo độ nguội: vàng (31-60), cam (61-90), đỏ (>90).
const badge = computed(() => {
  const d = days.value;
  if (d > 90) return { cls: 'bg-rose-100 text-rose-700', label: `Nguội ${d} ngày` };
  if (d > 60) return { cls: 'bg-amber-100 text-amber-700', label: `Nguội ${d} ngày` };
  return { cls: 'bg-yellow-100 text-yellow-700', label: `${d} ngày` };
});

// Soạn link Zalo: ưu tiên zalo_uid, fallback số điện thoại.
function openZalo() {
  const c = props.customer;
  const name = c.full_name || c.store_name || 'anh/chị';
  const msg =
    `Dạ em chào ${name} ạ. Lâu rồi mình chưa đặt hàng, ` +
    `không biết bên mình còn dùng sản phẩm bên em không ạ? ` +
    `Hiện em đang có vài chương trình ưu đãi cho đại lý, ` +
    `nếu cần bổ sung hàng thì em gửi báo giá mới nhất cho mình nhé. Em cảm ơn ạ!`;

  let url;
  if (c.zalo_uid) {
    url = `https://zalo.me/${c.zalo_uid}`;
  } else if (c.phone) {
    const phone = String(c.phone).replace(/\D/g, '');
    url = `https://zalo.me/${phone}`;
  } else {
    return;
  }
  // Một số client Zalo hỗ trợ tham số tin nhắn; nếu không, sale có thể dán lại.
  url += `?message=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener');
}

const canZalo = computed(() => !!(props.customer.zalo_uid || props.customer.phone));
</script>

<template>
  <div class="bg-white border border-line-200 rounded-card p-3.5 shadow-card flex gap-3">
    <!-- Avatar -->
    <div class="w-11 h-11 rounded-full bg-royal-50 text-royal-700 flex items-center justify-center font-bold shrink-0">
      {{ initials }}
    </div>

    <div class="min-w-0 flex-1">
      <!-- Name + tier + badge -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-semibold text-ink-primary truncate">{{ customer.full_name || '—' }}</span>
        <span
          v-if="customer.policy_tier"
          class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-royal-50 text-royal-700"
        >
          {{ tierLabel(customer.policy_tier) }}
        </span>
        <span
          class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
          :class="badge.cls"
        >
          {{ badge.label }}
        </span>
      </div>

      <!-- Sub: store / phone / province -->
      <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
        <span v-if="customer.store_name" class="truncate">🏪 {{ customer.store_name }}</span>
        <span v-if="customer.phone">📞 {{ customer.phone }}</span>
        <span v-if="customer.province">📍 {{ customer.province }}</span>
      </div>

      <!-- Stats row -->
      <div class="flex items-center gap-3 mt-2 text-[11px] text-ink-secondary flex-wrap">
        <span v-if="typeLabel">{{ typeLabel }}</span>
        <span>Mua cuối: {{ formatDateVN(customer.last_order_date) }}</span>
        <span>{{ customer.order_count || 0 }} đơn · {{ formatVNDShort(customer.total_revenue || 0) }}</span>
      </div>
    </div>

    <!-- Action -->
    <div class="shrink-0 flex items-center">
      <button
        @click="openZalo"
        :disabled="!canZalo"
        class="h-9 px-3 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-xs font-semibold shadow-pop flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        :title="canZalo ? 'Mở Zalo và soạn tin chào lại' : 'KH chưa có Zalo / SĐT'"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        Chào lại
      </button>
    </div>
  </div>
</template>
