<script setup>
defineProps({
  customer: { type: Object, required: true },
  tier: { type: String, default: 'dai_ly_cap_1' },
});
const emit = defineEmits(['change-tier', 'clear']);

const tiers = [
  { value: 'ctv', label: 'CTV' },
  { value: 'dai_ly_cap_1', label: 'Cấp 1' },
  { value: 'dai_ly_cap_2', label: 'Cấp 2 (VIP)' },
];
</script>

<template>
  <div class="bg-royal-50 border border-royal-100 rounded-xl p-3">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="font-semibold text-ink-primary truncate">{{ customer.fullName }}</div>
        <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2">
          <span v-if="customer.phone">📞 {{ customer.phone }}</span>
          <span v-if="customer.storeName">· {{ customer.storeName }}</span>
          <span v-if="customer.province">· {{ customer.province }}</span>
        </div>
      </div>
      <button
        @click="emit('clear')"
        class="text-ink-disabled hover:text-red-600 text-sm shrink-0"
        title="Bỏ chọn KH"
      >
        ✕
      </button>
    </div>

    <div class="mt-3">
      <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5">Bảng giá</div>
      <div class="grid grid-cols-3 gap-2">
        <label
          v-for="t in tiers"
          :key="t.value"
          class="flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-lg border cursor-pointer transition"
          :class="
            tier === t.value
              ? 'bg-royal-700 text-white border-royal-700'
              : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
          "
        >
          <input
            type="radio"
            :value="t.value"
            :checked="tier === t.value"
            @change="emit('change-tier', t.value)"
            class="sr-only"
          />
          {{ t.label }}
        </label>
      </div>
    </div>
  </div>
</template>
