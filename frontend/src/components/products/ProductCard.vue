<template>
  <v-card
    class="product-card"
    rounded="xl"
    variant="flat"
    @click="$emit('open', product.id)"
  >
    <div class="product-thumb">
      <v-img
        v-if="product.mainImageUrl"
        :src="product.mainImageUrl"
        cover
        class="product-thumb-img"
      >
        <template #placeholder>
          <div class="d-flex align-center justify-center fill-height">
            <v-progress-circular indeterminate color="primary" size="20" />
          </div>
        </template>
      </v-img>
      <div v-else class="d-flex align-center justify-center fill-height product-thumb-placeholder">
        <v-icon size="56" color="grey-lighten-1">mdi-image-off-outline</v-icon>
      </div>

      <v-chip
        v-if="product.brand"
        size="x-small"
        variant="elevated"
        color="primary"
        class="badge-brand"
      >
        {{ product.brand.name }}
      </v-chip>

      <v-chip
        size="x-small"
        variant="flat"
        :color="statusColor"
        class="badge-status"
      >
        {{ statusLabel }}
      </v-chip>
    </div>

    <v-card-text class="pa-3">
      <div class="text-body-2 font-weight-medium product-name" :title="product.name">
        {{ product.name }}
      </div>
      <div class="text-caption text-medium-emphasis font-mono mt-1">{{ product.sku }}</div>

      <div class="d-flex align-center justify-space-between mt-2">
        <div>
          <div class="text-caption text-medium-emphasis">Giá mặc định</div>
          <div class="font-mono text-body-2 font-weight-medium">
            {{ defaultPriceLabel }}
          </div>
        </div>
        <div class="text-right">
          <div class="text-caption text-medium-emphasis">Tồn kho</div>
          <div class="font-mono text-body-2 font-weight-medium" :class="`text-${stockClr}`">
            {{ product.totalStock }} {{ product.unit }}
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  formatVND,
  statusInfo,
  stockColor,
  type Product,
} from '@/composables/use-products';

const props = defineProps<{ product: Product }>();
defineEmits<{ (e: 'open', id: string): void }>();

const statusInfoComputed = computed(() => statusInfo(props.product.status));
const statusLabel = computed(() => statusInfoComputed.value.text);
const statusColor = computed(() => statusInfoComputed.value.color);

const stockClr = computed(() => stockColor(props.product));

const defaultPriceLabel = computed(() => {
  const def = props.product.prices?.find((p) => p.isDefault && p.active);
  if (!def) return '—';
  return formatVND(def.price);
});
</script>

<style scoped>
.product-card {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  height: 100%;
}
.product-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.product-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
}
.product-thumb-img {
  width: 100%;
  height: 100%;
}
.product-thumb-placeholder {
  width: 100%;
  height: 100%;
}
.badge-brand {
  position: absolute;
  top: 8px;
  left: 8px;
}
.badge-status {
  position: absolute;
  top: 8px;
  right: 8px;
}
.product-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.6em;
  line-height: 1.3;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
