<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  brands: { type: Array, default: () => [] }, // [{id, name, activeProductCount}]
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const query = ref('');
const rootEl = ref(null);

// Brands that still have a sellable (active) product — shown by default.
const activeBrands = computed(() =>
  props.brands.filter((b) => (b.activeProductCount ?? 0) > 0),
);

// When searching, match across ALL brands by name; otherwise only the
// brands that have active products (keeps the default list short & clean).
const visibleBrands = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return activeBrands.value;
  return props.brands.filter((b) => (b.name || '').toLowerCase().includes(q));
});

const selectedName = computed(() => {
  if (!props.modelValue) return 'Tất cả thương hiệu';
  const b = props.brands.find((x) => x.id === props.modelValue);
  return b ? b.name : 'Tất cả thương hiệu';
});

const hiddenCount = computed(() =>
  Math.max(0, props.brands.length - activeBrands.value.length),
);

function toggle() {
  open.value = !open.value;
  if (open.value) query.value = '';
}
function pick(id) {
  emit('update:modelValue', id);
  open.value = false;
  query.value = '';
}
function onDocClick(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      @click="toggle"
      class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-left flex items-center justify-between gap-2"
      :class="modelValue ? 'text-ink-primary' : 'text-ink-secondary'"
    >
      <span class="truncate">{{ selectedName }}</span>
      <svg class="w-4 h-4 shrink-0 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute z-50 mt-1 w-full bg-white border border-line-200 rounded-card shadow-pop overflow-hidden"
    >
      <!-- Search box -->
      <div class="p-2 border-b border-line-200">
        <div class="relative">
          <input
            v-model="query"
            type="search"
            placeholder="Gõ để tìm tất cả thương hiệu..."
            class="w-full h-9 pl-8 pr-2 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm"
          />
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      <div class="max-h-72 overflow-y-auto py-1">
        <!-- Tất cả -->
        <button
          type="button"
          @click="pick('')"
          class="w-full px-3 py-2 text-sm text-left hover:bg-surface-soft flex items-center gap-2"
          :class="!modelValue ? 'text-royal-700 font-semibold' : 'text-ink-primary'"
        >
          <span class="w-4">
            <svg v-if="!modelValue" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          Tất cả thương hiệu
        </button>

        <button
          v-for="b in visibleBrands"
          :key="b.id"
          type="button"
          @click="pick(b.id)"
          class="w-full px-3 py-2 text-sm text-left hover:bg-surface-soft flex items-center gap-2"
          :class="modelValue === b.id ? 'text-royal-700 font-semibold' : 'text-ink-primary'"
        >
          <span class="w-4">
            <svg v-if="modelValue === b.id" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          <span class="truncate flex-1">{{ b.name }}</span>
          <span v-if="(b.activeProductCount ?? 0) > 0" class="text-[11px] text-ink-secondary tabular-nums">{{ b.activeProductCount }}</span>
        </button>

        <div v-if="visibleBrands.length === 0" class="px-3 py-4 text-center text-xs text-ink-secondary">
          Không tìm thấy thương hiệu
        </div>
      </div>

      <!-- Hint about hidden brands -->
      <div v-if="!query && hiddenCount > 0" class="px-3 py-2 border-t border-line-200 text-[11px] text-ink-secondary">
        Đang ẩn {{ hiddenCount }} thương hiệu chưa có sản phẩm · gõ tìm để hiện
      </div>
    </div>
  </div>
</template>
