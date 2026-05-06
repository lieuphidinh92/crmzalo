<template>
  <v-card variant="outlined" rounded="xl" class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon class="mr-2" color="primary">mdi-receipt-text-outline</v-icon>
      <span class="section-header">Hoá đơn</span>
    </div>

    <v-radio-group v-model="kind" hide-details density="compact" class="mb-2">
      <v-radio label="Phiếu giao hàng nội bộ" value="delivery" />
      <v-radio label="Hoá đơn VAT (Easy Invoice)" value="vat" />
    </v-radio-group>

    <div v-if="kind === 'delivery'" class="mt-2">
      <v-btn
        color="primary"
        prepend-icon="mdi-printer"
        :disabled="!orderId"
        @click="$emit('print')"
      >
        In phiếu PDF
      </v-btn>
      <div class="text-caption text-medium-emphasis mt-2">
        Tính năng in phiếu PDF đầy đủ sẽ kích hoạt ở Session 2B (đang dùng nút placeholder).
      </div>
    </div>

    <div v-else class="mt-2">
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-file-cog-outline"
        @click="onVatClick"
      >
        Xuất VAT qua Easy Invoice
      </v-btn>
      <v-alert
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3"
      >
        Tính năng đang phát triển — sẽ tích hợp Easy Invoice ở phase sau.
      </v-alert>
    </div>

    <v-snackbar v-model="snackbar" timeout="2500" color="info">
      Chưa hoạt động — tính năng VAT sẽ được tích hợp với Easy Invoice ở phase sau.
    </v-snackbar>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ orderId: string | null }>();
defineEmits<{ (e: 'print'): void }>();

const kind = ref<'delivery' | 'vat'>('delivery');
const snackbar = ref(false);

function onVatClick() {
  snackbar.value = true;
}
</script>

<style scoped>
.section-header {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
</style>
