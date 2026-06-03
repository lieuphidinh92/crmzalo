<script setup>
/**
 * BrandLogo.vue — Logo nhận diện ngheduocsi.vn (brand v2).
 *
 * Tile vuông bo góc gradient Navy(#0A2540)→Royal(#1E40AF) + đốm amber
 * (#F59E0B) "ngọn đèn nhà thuốc" góc trên phải. Wordmark "ngheduocsi"
 * + ".vn" amber (font Nunito). Tagline "Nơi nghề dược sĩ cất lời." (Lora).
 *
 * Dùng chung cho Sidebar / Header / Login để brand nhất quán toàn app.
 */
import { computed, useId } from 'vue';

const props = defineProps({
  // sm 36px · md 40px · lg 44px · xl 56px
  size: { type: String, default: 'md' },
  // light = wordmark navy (trên nền sáng) · dark = wordmark trắng (trên nền navy)
  theme: { type: String, default: 'light' },
  showWordmark: { type: Boolean, default: true },
  showTagline: { type: Boolean, default: false },
});

// id gradient duy nhất mỗi instance để không đụng nhau khi có nhiều logo.
const uid = useId();
const gid = `nds-grad-${uid}`;
const wid = `nds-warm-${uid}`;

const SIZES = {
  sm: { tile: 'w-9 h-9', name: 'text-sm', tag: 'text-[10px]' },
  md: { tile: 'w-10 h-10', name: 'text-[15px]', tag: 'text-[10px]' },
  lg: { tile: 'w-11 h-11', name: 'text-lg', tag: 'text-xs' },
  xl: { tile: 'w-14 h-14', name: 'text-xl', tag: 'text-xs' },
};
const s = computed(() => SIZES[props.size] || SIZES.md);
</script>

<template>
  <div class="flex items-center gap-2.5">
    <!-- Tile "nds" -->
    <div :class="['shrink-0', s.tile]">
      <svg viewBox="0 0 100 100" class="w-full h-full">
        <defs>
          <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0A2540" />
            <stop offset="100%" stop-color="#1E40AF" />
          </linearGradient>
          <radialGradient :id="wid" cx="85%" cy="15%" r="70%">
            <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" rx="23" :fill="`url(#${gid})`" />
        <rect width="100" height="100" rx="23" :fill="`url(#${wid})`" />
        <text
          x="50"
          y="64"
          font-family="Nunito, system-ui, sans-serif"
          font-size="42"
          font-weight="900"
          fill="white"
          text-anchor="middle"
          letter-spacing="-2.5"
        >
          nds
        </text>
        <!-- Đốm amber + vòng mềm (đèn nhà thuốc / nhịp cộng đồng) -->
        <circle cx="77" cy="40" r="3.4" fill="#F59E0B" />
        <circle cx="77" cy="40" r="6.2" fill="none" stroke="#F59E0B" stroke-width="1" opacity="0.4" />
      </svg>
    </div>

    <!-- Wordmark + tagline -->
    <div v-if="showWordmark" class="leading-tight min-w-0">
      <div
        class="font-display font-extrabold tracking-tight truncate"
        :class="[s.name, theme === 'dark' ? 'text-white' : 'text-[#0A2540]']"
      >
        ngheduocsi<span class="text-amber-500">.vn</span>
      </div>
      <div
        v-if="showTagline"
        class="font-serif italic truncate"
        :class="[s.tag, theme === 'dark' ? 'text-slate-400' : 'text-ink-secondary']"
      >
        Nơi nghề dược sĩ cất lời.
      </div>
    </div>
  </div>
</template>
