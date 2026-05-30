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
  <div class="bg-orange-50 border border-orange-200 rounded-xl p-3">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="font-semibold text-gray-900 truncate">{{ customer.fullName }}</div>
        <div class="text-xs text-gray-600 mt-0.5 flex flex-wrap gap-x-2">
          <span v-if="customer.phone">📞 {{ customer.phone }}</span>
          <span v-if="customer.storeName">· {{ customer.storeName }}</span>
          <span v-if="customer.province">· {{ customer.province }}</span>
        </div>
      </div>
      <button
        @click="emit('clear')"
        class="text-gray-400 hover:text-rose-600 text-sm shrink-0"
        title="Bỏ chọn KH"
      >
        ✕
      </button>
    </div>

    <div class="mt-3">
      <div class="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Bảng giá</div>
      <div class="grid grid-cols-3 gap-2">
        <label
          v-for="t in tiers"
          :key="t.value"
          class="flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-lg border cursor-pointer transition"
          :class="
            tier === t.value
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-500'
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
