<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" class="sparkline">
    <polyline
      :points="points"
      fill="none"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <polyline
      v-if="filled"
      :points="filledPoints"
      :fill="color"
      fill-opacity="0.15"
      stroke="none"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  width: 80,
  height: 24,
  color: '#F59E0B',
  filled: true,
});

const points = computed(() => {
  if (!props.data.length) return '';
  const max = Math.max(...props.data, 1);
  const min = Math.min(...props.data, 0);
  const range = max - min || 1;
  return props.data
    .map((v, i) => {
      const x = (i / (props.data.length - 1 || 1)) * (props.width - 4) + 2;
      const y = props.height - 2 - ((v - min) / range) * (props.height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
});

const filledPoints = computed(() => {
  if (!points.value) return '';
  return `2,${props.height - 2} ${points.value} ${props.width - 2},${props.height - 2}`;
});
</script>

<style scoped>
.sparkline { display: block; }
</style>
