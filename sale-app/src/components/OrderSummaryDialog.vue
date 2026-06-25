<script setup>
/**
 * OrderSummaryDialog.vue — hiện sau khi Lưu tạm / Xác nhận đơn.
 * Tóm tắt sơ bộ KH + đơn, kèm 2 nút mở phiếu: Hoá đơn bán hàng / Biên bản bàn giao.
 */
import { ref } from 'vue';
import { formatVND } from '../composables/useFormat';
import SalesDocument from './SalesDocument.vue';

const props = defineProps({
  order: { type: Object, required: true },
});
const emit = defineEmits(['close']);

const docType = ref(null); // null | 'export' | 'handover'
const isDraft = props.order.status === 'draft';
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-line-200 flex items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm">✓</span>
            <span class="font-bold text-ink-primary">
              {{ isDraft ? 'Đã lưu tạm đơn' : 'Đã tạo đơn' }}
            </span>
            <span
              class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              :class="isDraft ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'"
            >{{ isDraft ? 'Nháp' : 'Đã chốt' }}</span>
          </div>
          <div class="text-sm font-mono text-royal-700 font-semibold mt-1">{{ order.order_code }}</div>
        </div>
        <button @click="emit('close')" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
      </div>

      <!-- Tóm tắt -->
      <div class="px-5 py-4 space-y-3 text-sm">
        <div class="flex justify-between">
          <span class="text-ink-secondary">Khách hàng</span>
          <span class="font-medium text-ink-primary text-right">
            {{ order.customerName || '—' }}<template v-if="order.customerPhone"> · {{ order.customerPhone }}</template>
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-ink-secondary">NV phụ trách</span>
          <span class="font-medium text-ink-primary">{{ order.saleName || '—' }}</span>
        </div>
        <div class="border-t border-line-200 pt-2 space-y-1">
          <div v-for="(it, i) in order.items" :key="i" class="flex justify-between text-[13px]">
            <span class="text-ink-primary truncate pr-2">{{ it.name }} <span class="text-ink-disabled">×{{ it.quantity }}</span></span>
            <span class="text-ink-secondary shrink-0">{{ formatVND(it.lineTotal) }}</span>
          </div>
        </div>
        <div class="flex justify-between border-t border-line-200 pt-2">
          <span class="font-semibold text-ink-primary">Tổng thanh toán</span>
          <span class="text-lg font-bold text-royal-700">{{ formatVND(order.total) }}</span>
        </div>
        <div v-if="order.debt > 0" class="flex justify-between">
          <span class="text-amber-800">Còn nợ</span>
          <span class="font-semibold text-amber-800">{{ formatVND(order.debt) }}</span>
        </div>
      </div>

      <!-- 2 nút phiếu -->
      <div class="px-5 pb-3 grid grid-cols-2 gap-2">
        <button
          @click="docType = 'export'"
          class="h-12 rounded-xl bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          🧾 Phiếu xuất kho bán hàng
        </button>
        <button
          @click="docType = 'handover'"
          class="h-12 rounded-xl border border-royal-700 text-royal-700 hover:bg-royal-50 text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          📋 Biên bản bàn giao
        </button>
      </div>

      <!-- Đóng / tạo đơn mới -->
      <div class="px-5 pb-5">
        <button
          @click="emit('close')"
          class="w-full h-11 rounded-xl border border-line-300 text-ink-primary text-sm font-medium hover:bg-surface-50"
        >
          Tạo đơn mới
        </button>
      </div>
    </div>

    <!-- Phiếu (overlay trên cùng) -->
    <SalesDocument
      v-if="docType"
      :order="order"
      :type="docType"
      :company-key="order.invoicingCompany || 'halovn'"
      @close="docType = null"
      @done="emit('close')"
    />
  </div>
</template>
