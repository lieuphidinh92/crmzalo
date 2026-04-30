<template>
  <!-- ICON ONLY -->
  <div v-if="variant === 'icon'" :class="className">
    <component :is="iconSvg" />
  </div>

  <!-- HORIZONTAL: icon + wordmark + slogan -->
  <div
    v-else-if="variant === 'horizontal'"
    :class="className"
    :style="horizontalRoot"
  >
    <component :is="iconSvg" />
    <div style="display: flex; flex-direction: column">
      <div :style="wordmarkStyle">
        <span :style="{ color: wordmarkColor }">ngheduocsi</span>
        <span style="color: var(--brand-amber-500)">.vn</span>
      </div>
      <div :style="sloganStyle">Nơi nghề dược sĩ cất lời.</div>
    </div>
  </div>

  <!-- STACKED: icon over wordmark over divider over slogan -->
  <div v-else :class="className" :style="stackedRoot">
    <component :is="iconSvg" />
    <div :style="stackedTextWrap">
      <div :style="wordmarkStyleStacked">
        <span :style="{ color: wordmarkColor }">ngheduocsi</span>
        <span style="color: var(--brand-amber-500)">.vn</span>
      </div>
      <div :style="dividerStyle" />
      <div :style="sloganStyleStacked">Nơi nghề dược sĩ cất lời.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, type CSSProperties } from 'vue';

type LogoVariant = 'icon' | 'horizontal' | 'stacked';
type LogoTheme = 'dark' | 'light';

interface Props {
  variant?: LogoVariant;
  size?: number;
  theme?: LogoTheme;
  className?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'icon',
  size: 48,
  theme: 'dark',
  className: '',
});

const wordmarkColor = computed(() =>
  props.theme === 'dark' ? '#FFFFFF' : '#0A1628',
);
const sloganColor = computed(() =>
  props.theme === 'dark' ? '#B8C5D6' : '#2A4775',
);

// Unique gradient ID per variant+size to avoid SVG defs collisions when
// multiple BrandLogo instances share the same DOM.
const gradId = computed(() => `nds-bg-${props.variant}-${props.size}`);
const glowId = computed(() => `nds-glow-${props.variant}-${props.size}`);

const iconSvg = computed(() => {
  const s = props.size;
  return () =>
    h(
      'svg',
      {
        width: s,
        height: s,
        viewBox: '0 0 200 200',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-label': 'ngheduocsi.vn logo',
        role: 'img',
      },
      [
        h('defs', null, [
          h(
            'linearGradient',
            { id: gradId.value, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
            [
              h('stop', { offset: '0%', 'stop-color': '#1E3458' }),
              h('stop', { offset: '100%', 'stop-color': '#0A1628' }),
            ],
          ),
          h(
            'radialGradient',
            { id: glowId.value, cx: '75%', cy: '20%', r: '50%' },
            [
              h('stop', {
                offset: '0%',
                'stop-color': '#F59E0B',
                'stop-opacity': '0.25',
              }),
              h('stop', {
                offset: '100%',
                'stop-color': '#F59E0B',
                'stop-opacity': '0',
              }),
            ],
          ),
        ]),
        h('rect', {
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          rx: 44,
          fill: `url(#${gradId.value})`,
        }),
        h('rect', {
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          rx: 44,
          fill: `url(#${glowId.value})`,
        }),
        h(
          'text',
          {
            x: 100,
            y: 138,
            'text-anchor': 'middle',
            'font-family': 'Inter, "Plus Jakarta Sans", system-ui, sans-serif',
            'font-size': 92,
            'font-weight': 800,
            fill: '#FFFFFF',
            'letter-spacing': -4,
          },
          'nds',
        ),
        h('circle', {
          cx: 158,
          cy: 62,
          r: 11,
          fill: 'none',
          stroke: '#F59E0B',
          'stroke-width': 2.5,
        }),
        h('circle', { cx: 158, cy: 62, r: 6, fill: '#F59E0B' }),
      ],
    );
});

const horizontalRoot = computed<CSSProperties>(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}));

const wordmarkStyle = computed<CSSProperties>(() => ({
  fontFamily: 'Inter, "Plus Jakarta Sans", system-ui, sans-serif',
  fontSize: `${props.size * 0.5}px`,
  fontWeight: 800,
  letterSpacing: '-0.5px',
  lineHeight: 1,
}));

const sloganStyle = computed<CSSProperties>(() => ({
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: `${props.size * 0.23}px`,
  fontStyle: 'italic',
  color: sloganColor.value,
  marginTop: '4px',
}));

const stackedRoot = computed<CSSProperties>(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
}));

const stackedTextWrap = computed<CSSProperties>(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
}));

const wordmarkStyleStacked = computed<CSSProperties>(() => ({
  fontFamily: 'Inter, "Plus Jakarta Sans", system-ui, sans-serif',
  fontSize: `${props.size * 0.32}px`,
  fontWeight: 800,
  letterSpacing: '-0.5px',
  lineHeight: 1,
}));

const dividerStyle = computed<CSSProperties>(() => ({
  width: `${props.size * 0.64}px`,
  height: '3px',
  background: 'var(--brand-amber-500)',
  borderRadius: '2px',
}));

const sloganStyleStacked = computed<CSSProperties>(() => ({
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: `${props.size * 0.15}px`,
  fontStyle: 'italic',
  color: sloganColor.value,
}));
</script>
