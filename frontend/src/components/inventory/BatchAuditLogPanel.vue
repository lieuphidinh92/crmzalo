<template>
  <v-navigation-drawer
    :model-value="modelValue"
    location="right"
    width="440"
    temporary
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="pa-4 d-flex align-center" style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
      <div>
        <div class="text-h6">Lịch sử lô hàng</div>
        <div v-if="batch" class="text-caption text-medium-emphasis font-mono">
          {{ batch.batchCode }} · {{ batch.product?.sku ?? '' }}
        </div>
      </div>
      <v-spacer />
      <v-btn icon variant="text" size="small" @click="$emit('update:modelValue', false)">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <div class="pa-4">
      <v-progress-linear v-if="loading" indeterminate color="primary" />

      <div v-else-if="movements.length === 0" class="text-center py-8 text-caption text-medium-emphasis empty">
        Chưa có hoạt động nào
      </div>

      <div v-else class="timeline">
        <div
          v-for="m in movements"
          :key="m.id"
          class="timeline-item"
        >
          <div class="timeline-dot" :style="{ background: dotColor(m.type) }">
            <v-icon size="14" color="white">{{ typeInfo(m.type).icon }}</v-icon>
          </div>
          <div class="timeline-content">
            <div class="d-flex align-center">
              <v-chip :color="typeInfo(m.type).color" size="x-small" variant="tonal">
                {{ typeInfo(m.type).text }}
              </v-chip>
              <span
                class="font-mono ml-2 font-weight-bold"
                :class="m.quantity > 0 ? 'text-success' : 'text-error'"
              >
                {{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}
              </span>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">{{ formatDateTime(m.createdAt) }}</span>
            </div>
            <div v-if="m.note" class="text-body-2 mt-1">{{ m.note }}</div>
            <div class="text-caption text-medium-emphasis mt-1">
              <span v-if="m.order">
                <v-icon size="12">mdi-cart</v-icon>
                Đơn <a class="text-decoration-underline" href="#" @click.prevent="goOrder(m.order!.id)">{{ m.order.orderCode }}</a>
              </span>
              <span v-if="m.createdByName" class="ml-2">
                <v-icon size="12">mdi-account</v-icon>
                {{ m.createdByName }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  useInventory,
  movementTypeInfo,
  type Batch,
  type InventoryMovement,
} from '@/composables/use-inventory';

const props = defineProps<{
  modelValue: boolean;
  batch: Batch | null;
}>();

defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const router = useRouter();
const { fetchMovements } = useInventory();

const movements = ref<InventoryMovement[]>([]);
const loading = ref(false);

async function load() {
  if (!props.batch) {
    movements.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await fetchMovements({ batchId: props.batch.id, limit: 100 });
    movements.value = res.movements;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.modelValue, props.batch?.id],
  ([open, id]) => {
    if (open && id) load();
    else movements.value = [];
  },
  { immediate: true },
);

function typeInfo(t: string) {
  return movementTypeInfo(t);
}

function dotColor(t: string) {
  const map: Record<string, string> = {
    import: '#16a34a',
    export: '#3b82f6',
    return: '#f59e0b',
    adjust: '#a855f7',
  };
  return map[t] ?? '#64748b';
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function goOrder(id: string) {
  router.push(`/orders/${id}`);
}
</script>

<style scoped>
.empty {
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  padding: 24px;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.timeline {
  position: relative;
}
.timeline::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 11px;
  width: 2px;
  background: rgba(255, 255, 255, 0.08);
}
.timeline-item {
  position: relative;
  padding-left: 36px;
  padding-bottom: 16px;
}
.timeline-dot {
  position: absolute;
  left: 0;
  top: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.timeline-content {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
}
</style>
