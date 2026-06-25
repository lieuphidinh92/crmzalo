<script setup>
/**
 * CompanyPickDialog.vue — popup hỏi "Xuất hoá đơn từ công ty nào?" trước khi
 * chốt đơn. Chọn HaloVN / Inocare → phát sự kiện `pick` kèm key công ty.
 */
import { COMPANY_LIST } from '../composables/useCompanies';

defineProps({
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['pick', 'close']);
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
      <div class="flex items-start justify-between mb-1">
        <h3 class="text-lg font-bold text-ink-primary">Xuất hoá đơn từ công ty nào?</h3>
        <button @click="emit('close')" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
      </div>
      <p class="text-sm text-ink-secondary mb-4">
        Chọn pháp nhân để in Phiếu xuất kho bán hàng &amp; Biên bản bàn giao.
      </p>

      <div class="grid grid-cols-1 gap-2.5">
        <button
          v-for="c in COMPANY_LIST"
          :key="c.key"
          :disabled="busy"
          @click="emit('pick', c.key)"
          class="text-left p-4 rounded-xl border border-line-300 hover:border-royal-700 hover:bg-royal-50 transition disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div class="flex items-center justify-between">
            <span class="text-base font-bold text-ink-primary group-hover:text-royal-700">{{ c.short }}</span>
            <span class="text-royal-700 opacity-0 group-hover:opacity-100 transition">→</span>
          </div>
          <div class="text-[12px] text-ink-secondary mt-0.5 leading-snug">{{ c.name }}</div>
        </button>
      </div>

      <button
        @click="emit('close')"
        :disabled="busy"
        class="w-full h-11 mt-4 rounded-xl border border-line-300 text-ink-primary text-sm font-medium hover:bg-surface-50 disabled:opacity-50"
      >
        {{ busy ? 'Đang tạo đơn...' : 'Huỷ' }}
      </button>
    </div>
  </div>
</template>
