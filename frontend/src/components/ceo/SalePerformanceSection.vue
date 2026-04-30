<template>
  <v-card class="pa-4">
    <!-- Header -->
    <div class="d-flex align-center mb-3 flex-wrap gap-2">
      <div class="text-h6">
        🏆 Hiệu quả Sale tháng <span class="text-primary">{{ monthDisplay }}</span>
      </div>
      <v-spacer />
      <v-text-field
        v-model="monthInput"
        type="month"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 180px;"
        class="mr-2"
      />
      <v-btn
        prepend-icon="mdi-tune-variant"
        variant="tonal"
        size="small"
        @click="showWeights = true"
      >
        Tuỳ chỉnh trọng số
      </v-btn>
    </div>

    <!-- Empty/insufficient data banner -->
    <v-alert
      v-if="overview && !overview.hasEnoughData"
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-3"
    >
      Hệ thống chưa đủ 30 ngày data — kết quả đánh giá có thể chưa chính xác.
    </v-alert>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <!-- Member-only view note -->
    <v-alert
      v-if="overview?.memberView"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3"
    >
      Bạn đang xem ở chế độ Member — chỉ thấy điểm số của bản thân.
    </v-alert>

    <!-- Top 3 podium -->
    <SalePerfPodium
      v-if="overview && overview.rows.length >= 3"
      :rows="overview.rows"
      class="mb-3 page-break-avoid"
    />

    <!-- Detail table -->
    <SalePerfTable
      v-if="overview"
      :rows="overview.rows"
      @open-detail="openDetail"
      class="mb-4"
    />

    <!-- Alerts (admin/owner only — member view doesn't have alerts) -->
    <SalePerfAlerts
      v-if="!overview?.memberView"
      :alerts="alerts"
      class="page-break-avoid"
    />

    <!-- Weight config modal -->
    <SaleScoreWeightsModal
      v-model="showWeights"
      :weights="weights"
      :rows="overview?.rows ?? []"
      :can-edit="canEditWeights"
      :saving="weightsSaving"
      @save="onSaveWeights"
      @reset="onResetWeights"
    />

    <!-- Detail slide-over -->
    <SalePerfDetailPanel
      v-model="detailOpen"
      :detail="currentDetail"
      :sending-feedback="sendingFeedback"
      @send-feedback="onSendFeedback"
    />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import SalePerfPodium from './SalePerfPodium.vue';
import SalePerfTable from './SalePerfTable.vue';
import SalePerfAlerts from './SalePerfAlerts.vue';
import SalePerfDetailPanel from './SalePerfDetailPanel.vue';
import SaleScoreWeightsModal from './SaleScoreWeightsModal.vue';
import {
  useSalePerformance,
  type MetricKey,
  type SaleDetail,
} from '@/composables/use-sale-performance';
import { useSaleScoreConfig } from '@/composables/use-sale-score-config';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const canEditWeights = computed(
  () => authStore.user?.role === 'owner' || authStore.user?.role === 'admin',
);

const {
  month,
  overview,
  alerts,
  loading,
  fetchOverview,
  fetchDetail,
  sendFeedback,
} = useSalePerformance();

const {
  weights,
  saving: weightsSaving,
  fetchConfig,
  updateWeights,
  resetToDefaults,
} = useSaleScoreConfig();

const monthInput = ref(month.value);
watch(monthInput, (val) => {
  month.value = val;
  fetchOverview();
});

const monthDisplay = computed(() => {
  const [y, m] = month.value.split('-');
  return `${m}/${y}`;
});

const showWeights = ref(false);
const detailOpen = ref(false);
const currentDetail = ref<SaleDetail | null>(null);
const sendingFeedback = ref(false);
const toast = ref({ show: false, text: '', color: 'success' as string });

async function openDetail(saleId: string) {
  detailOpen.value = true;
  currentDetail.value = null;
  try {
    currentDetail.value = await fetchDetail(saleId);
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Không tải được chi tiết',
      color: 'error',
    };
    detailOpen.value = false;
  }
}

async function onSendFeedback(saleId: string, message: string) {
  sendingFeedback.value = true;
  try {
    await sendFeedback(saleId, message);
  } finally {
    sendingFeedback.value = false;
  }
}

async function onSaveWeights(
  updates: Array<{ metricKey: MetricKey; weight: number }>,
) {
  try {
    await updateWeights(updates);
    toast.value = {
      show: true,
      text: 'Đã lưu trọng số. Đang tính lại score...',
      color: 'success',
    };
    await fetchOverview(); // re-fetch with new weights
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Lưu thất bại',
      color: 'error',
    };
  }
}

async function onResetWeights() {
  try {
    await resetToDefaults();
    toast.value = {
      show: true,
      text: 'Đã reset về mặc định',
      color: 'success',
    };
    await fetchOverview();
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Reset thất bại',
      color: 'error',
    };
  }
}

onMounted(async () => {
  await Promise.all([fetchOverview(), fetchConfig()]);
});
</script>
