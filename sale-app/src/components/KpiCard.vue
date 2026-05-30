<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  trendLabel: { type: String, default: '' },
  trendUp: { type: Boolean, default: null },
  action: { type: String, default: '' },
  icon: { type: String, default: 'trending-up' },
  iconColor: { type: String, default: 'royal' },
});
</script>

<template>
  <div class="bg-white border border-line-200 rounded-card p-5 shadow-card">
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="text-[13px] text-ink-secondary font-medium">{{ label }}</div>
      <div
        class="w-10 h-10 rounded-input flex items-center justify-center shrink-0"
        :class="{
          'bg-royal-50 text-royal-700': iconColor === 'royal',
          'bg-amber-50 text-amber-600': iconColor === 'amber',
          'bg-green-50 text-green-700': iconColor === 'green',
          'bg-red-50 text-red-700': iconColor === 'red',
        }"
      >
        <!-- Lucide icons (2px stroke, rounded) -->
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <g v-if="icon === 'trending-up'"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></g>
          <g v-else-if="icon === 'coins'"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1110.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/></g>
          <g v-else-if="icon === 'shopping-bag'"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></g>
          <g v-else-if="icon === 'dollar-circle'"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8M12 6v2M12 16v2"/></g>
        </svg>
      </div>
    </div>
    <div class="text-2xl lg:text-[28px] font-bold text-ink-primary leading-tight tracking-tight">
      {{ value }}
    </div>
    <div v-if="trendLabel" class="mt-1.5 flex items-center gap-1 text-[11px]">
      <svg
        v-if="trendUp !== null"
        class="w-3.5 h-3.5"
        :class="trendUp ? 'text-green-600' : 'text-red-600'"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path v-if="trendUp" d="M7 14l5-5 5 5z"/>
        <path v-else d="M7 10l5 5 5-5z"/>
      </svg>
      <span :class="trendUp === null ? 'text-ink-secondary' : trendUp ? 'text-green-600 font-medium' : 'text-red-600 font-medium'">
        {{ trendLabel }}
      </span>
    </div>
    <button
      v-if="action"
      class="mt-1.5 text-[11px] text-royal-700 font-medium hover:underline opacity-60 cursor-not-allowed"
      disabled
    >
      {{ action }} ›
    </button>
  </div>
</template>
