<template>
  <div class="pipeline-bar">
    <div class="steps">
      <div
        v-for="(step, idx) in steps"
        :key="step.value"
        class="step"
        :class="{
          'step--done': stepIndex(step.value) < currentIdx,
          'step--current': step.value === current,
          'step--cancelled': current === 'cancelled' && step.value !== 'cancelled',
        }"
      >
        <div class="step-circle">
          <v-icon size="16">{{ step.icon }}</v-icon>
        </div>
        <div class="step-label">{{ step.text }}</div>
        <div v-if="idx < steps.length - 1" class="step-bar" />
      </div>
    </div>

    <div v-if="current === 'cancelled'" class="text-center text-error mt-2">
      <v-icon size="14" class="mr-1">mdi-close-circle</v-icon>
      Đơn đã huỷ
      <span v-if="cancelReason" class="text-caption text-medium-emphasis ml-2">— {{ cancelReason }}</span>
    </div>

    <div v-if="canEdit && nextStep && current !== 'cancelled' && current !== 'completed'" class="text-center mt-3 d-flex align-center justify-center flex-wrap" style="gap: 8px;">
      <v-btn
        color="primary"
        :prepend-icon="nextStep.icon"
        :loading="busy"
        @click="$emit('advance', nextStep.value)"
      >
        Chuyển sang {{ nextStep.text }}
      </v-btn>
      <v-btn
        v-if="current !== 'cancelled'"
        color="error"
        variant="outlined"
        prepend-icon="mdi-close"
        :disabled="busy"
        @click="$emit('cancel')"
      >
        Huỷ đơn
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ORDER_STATUS_OPTIONS, type OrderStatus } from '@/composables/use-orders';

const props = defineProps<{
  current: OrderStatus;
  canEdit: boolean;
  cancelReason?: string | null;
  busy?: boolean;
}>();

defineEmits<{
  (e: 'advance', to: OrderStatus): void;
  (e: 'cancel'): void;
}>();

// "Đóng gói" (packing) đã gộp vào "Đang giao" — ẩn khỏi pipeline nên nút
// "Chuyển sang…" đi thẳng Xác nhận → Đang giao (trừ kho FIFO ở bước Giao).
// Vẫn giữ 'packing' trong ORDER_STATUS_OPTIONS để statusLabel hiển thị đúng
// cho đơn cũ (nếu còn) — chỉ loại khỏi luồng thao tác.
const steps = ORDER_STATUS_OPTIONS.filter((s) => s.value !== 'cancelled' && s.value !== 'packing');

function stepIndex(s: string) {
  return steps.findIndex((step) => step.value === s);
}

const currentIdx = computed(() => stepIndex(props.current));

const nextStep = computed(() => {
  const i = currentIdx.value;
  if (i < 0 || i >= steps.length - 1) return null;
  return steps[i + 1];
});
</script>

<style scoped>
.pipeline-bar {
  padding: 16px 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.steps {
  display: flex;
  align-items: flex-start;
  gap: 0;
  overflow-x: auto;
  padding: 4px 8px;
}
.step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 90px;
  flex: 1 1 auto;
}
.step-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  transition: all 0.2s ease;
}
.step-label {
  font-size: 0.7rem;
  margin-top: 6px;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
}
.step-bar {
  position: absolute;
  top: 17px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  z-index: 1;
}

.step--done .step-circle {
  background: rgb(var(--v-theme-success));
  border-color: rgb(var(--v-theme-success));
  color: rgb(var(--v-theme-on-primary));
}
.step--done .step-label {
  color: rgb(var(--v-theme-success));
}
.step--done .step-bar {
  background: rgb(var(--v-theme-success));
}
.step--current .step-circle {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.18);
}
.step--current .step-label {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.step--cancelled .step-circle {
  opacity: 0.35;
}
.step--cancelled .step-label {
  opacity: 0.4;
}

@media (max-width: 600px) {
  .step {
    min-width: 70px;
  }
  .step-label {
    font-size: 0.62rem;
  }
}
</style>
