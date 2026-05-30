<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

// Phase 2 placeholder content — replace with real campaign data in Phase 3.
const endsAt = ref(new Date(Date.now() + 1000 * 60 * 60 * 26 + 1000 * 36 * 60));
const now = ref(new Date());
let timer = null;

onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 1000);
});
onUnmounted(() => clearInterval(timer));

const remain = computed(() => {
  const ms = Math.max(0, endsAt.value.getTime() - now.value.getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return [
    { label: 'Ngày', val: String(days).padStart(2, '0') },
    { label: 'Giờ', val: String(hours).padStart(2, '0') },
    { label: 'Phút', val: String(mins).padStart(2, '0') },
    { label: 'Giây', val: String(secs).padStart(2, '0') },
  ];
});
</script>

<template>
  <div
    class="relative overflow-hidden rounded-card text-white p-5 lg:p-6 shadow-card"
    style="background: linear-gradient(135deg, #0A2540 0%, #1E40AF 100%)"
  >
    <div class="absolute -right-10 -bottom-10 w-56 h-56 rounded-full bg-amber-500/15 blur-3xl"></div>

    <!-- Gift illustration top-right -->
    <div class="absolute right-4 top-4 hidden sm:block">
      <svg width="140" height="120" viewBox="0 0 140 120" fill="none" class="opacity-90">
        <!-- Ribbon top -->
        <path d="M62 40c-8-16-28-8-22 6 4 8 18 12 28 4M78 40c8-16 28-8 22 6-4 8-18 12-28 4" stroke="#F59E0B" stroke-width="5" fill="none" stroke-linecap="round"/>
        <!-- Box body -->
        <rect x="22" y="46" width="96" height="62" rx="6" fill="#F59E0B"/>
        <rect x="22" y="46" width="96" height="18" fill="#D97706"/>
        <!-- Vertical ribbon -->
        <rect x="64" y="46" width="12" height="62" fill="#1E40AF"/>
        <!-- Horizontal ribbon -->
        <rect x="22" y="68" width="96" height="6" fill="#1E40AF"/>
        <!-- Sparkles -->
        <circle cx="20" cy="30" r="2" fill="#F59E0B"/>
        <circle cx="125" cy="38" r="2.5" fill="#F59E0B"/>
        <circle cx="130" cy="100" r="2" fill="#FEF3C7"/>
      </svg>
    </div>

    <div class="relative max-w-[60%]">
      <div class="text-[11px] uppercase tracking-[0.15em] text-amber-500 font-bold mb-2">
        Chương trình hôm nay
      </div>
      <div class="text-3xl lg:text-4xl font-bold text-amber-500 leading-none mb-1.5 tracking-tight">
        MUA 5 TẶNG 1
      </div>
      <div class="text-sm lg:text-base font-semibold text-white/90 mb-4">
        Tặng POSM + Freeship toàn quốc
      </div>

      <div class="text-[11px] text-slate-300 mb-1.5 uppercase tracking-wide">Kết thúc sau</div>
      <div class="flex gap-2 mb-4">
        <div
          v-for="t in remain"
          :key="t.label"
          class="bg-white/10 backdrop-blur rounded-input w-[52px] h-[52px] flex flex-col items-center justify-center"
        >
          <div class="text-lg font-bold leading-none tabular-nums">{{ t.val }}</div>
          <div class="text-[9px] text-slate-300 mt-0.5">{{ t.label }}</div>
        </div>
      </div>

      <button class="h-10 px-5 rounded-btn bg-amber-500 text-navy-900 font-bold text-sm hover:bg-amber-600 transition">
        Xem chi tiết
      </button>
    </div>
  </div>
</template>
