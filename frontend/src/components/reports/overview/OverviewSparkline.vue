<template>
  <svg
    class="sparkline"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <!-- baseline (subtle) -->
    <line
      :x1="0"
      :x2="width"
      :y1="height - 1"
      :y2="height - 1"
      stroke="rgba(148,163,184,0.12)"
      stroke-width="0.5"
    />
    <!-- bars -->
    <rect
      v-for="(p, i) in points"
      :key="i"
      :x="p.x"
      :y="p.y"
      :width="barWidth"
      :height="p.h"
      :class="['bar', i === points.length - 1 && 'bar--current']"
      :fill="i === points.length - 1 ? activeColor : `rgba(${rgb}, 0.55)`"
      rx="1.5"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  /** Up to 6 data points (most recent at the end). */
  values: number[];
  /** Hex color of the highlighted last bar. Default: orange-500. */
  color?: string;
}
const props = withDefaults(defineProps<Props>(), {
  color: '#F97316',
});

const width = 60;
const height = 16;
const gap = 1.5;

const barWidth = computed(() => {
  const n = Math.max(props.values.length, 1);
  return Math.max(2, (width - (n - 1) * gap) / n);
});

const points = computed(() => {
  const vals = props.values.map((v) => Math.max(0, Number(v) || 0));
  const max = Math.max(1, ...vals);
  return vals.map((v, i) => {
    const h = (v / max) * (height - 2);
    return {
      x: i * (barWidth.value + gap),
      y: height - h - 1,
      h: Math.max(1, h),
    };
  });
});

/** Convert hex color to "r,g,b" tuple for use in rgba() with opacity. */
const rgb = computed(() => {
  const hex = props.color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r},${g},${b}`;
});

const activeColor = computed(() => props.color);
</script>

<style scoped>
.sparkline {
  width: 100%;
  height: 16px;
  display: block;
}
.bar {
  transition: opacity 0.18s;
}
</style>
