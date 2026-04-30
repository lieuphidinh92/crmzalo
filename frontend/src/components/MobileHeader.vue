<template>
  <header class="nds-mobile-header">
    <button
      v-if="showBack"
      type="button"
      class="nds-mobile-header__back"
      :aria-label="'Quay lại'"
      @click="$emit('back')"
    >
      <v-icon icon="mdi-chevron-left" :size="28" />
    </button>
    <BrandLogo v-else variant="horizontal" :size="30" theme="dark" />

    <span v-if="title" class="nds-mobile-header__title">{{ title }}</span>

    <div class="nds-mobile-header__actions">
      <slot name="action" />
    </div>
  </header>
</template>

<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue';

interface Props {
  title?: string;
  showBack?: boolean;
}

withDefaults(defineProps<Props>(), {
  title: '',
  showBack: false,
});

defineEmits<{
  (e: 'back'): void;
}>();
</script>

<style scoped>
.nds-mobile-header__back {
  background: transparent;
  border: none;
  color: var(--brand-amber-500);
  cursor: pointer;
  padding: 0 4px 0 0;
  display: flex;
  align-items: center;
  min-height: 44px;
  min-width: 44px;
  justify-content: center;
}

.nds-mobile-header__title {
  flex: 1;
  color: var(--text-primary);
  font-family: 'Inter', 'Plus Jakarta Sans', sans-serif;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nds-mobile-header__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
