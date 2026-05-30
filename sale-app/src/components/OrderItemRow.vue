<script setup>
import { formatVND } from '../composables/useFormat';

const props = defineProps({
  item: { type: Object, required: true },
});
const emit = defineEmits(['update-qty', 'remove']);

function dec() {
  if (props.item.quantity > 1) emit('update-qty', props.item.quantity - 1);
}
function inc() {
  emit('update-qty', props.item.quantity + 1);
}
function onInput(e) {
  const val = parseInt(e.target.value);
  if (!isNaN(val) && val >= 1) emit('update-qty', val);
}
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-xl p-3">
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="min-w-0 flex-1">
        <div class="font-mono text-[10px] text-gray-500">{{ item.sku }}</div>
        <div class="font-medium text-sm text-gray-900 truncate">{{ item.name }}</div>
      </div>
      <button @click="emit('remove')" class="text-gray-400 hover:text-rose-600 shrink-0" title="Xoá">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/>
        </svg>
      </button>
    </div>

    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center bg-gray-100 rounded-lg">
        <button @click="dec" class="w-9 h-9 text-gray-700 font-bold hover:bg-gray-200 rounded-l-lg">−</button>
        <input
          :value="item.quantity"
          @input="onInput"
          type="number"
          min="1"
          class="w-12 h-9 text-center bg-transparent outline-none font-semibold"
        />
        <button @click="inc" class="w-9 h-9 text-gray-700 font-bold hover:bg-gray-200 rounded-r-lg">+</button>
      </div>

      <div class="text-right">
        <div class="text-[11px] text-gray-500">{{ formatVND(item.unitPrice) }} × {{ item.quantity }}</div>
        <div class="font-bold text-brand-600">{{ formatVND(item.unitPrice * item.quantity) }}</div>
      </div>
    </div>

    <div v-if="item.stock !== undefined && item.quantity > item.stock" class="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
      ⚠ Vượt tồn kho (còn {{ item.stock }})
    </div>
  </div>
</template>
