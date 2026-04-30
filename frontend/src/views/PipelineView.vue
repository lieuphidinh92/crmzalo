<template>
  <div class="pipeline-view">
    <!-- Header -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5">
        <v-icon class="mr-2" color="primary">mdi-pipe</v-icon>
        Pipeline cơ hội
      </h1>
      <span class="text-caption text-medium-emphasis">
        Phễu bán hàng B2B sỉ — kéo thả card để chuyển stage
      </span>
      <v-spacer />
      <v-btn
        prepend-icon="mdi-refresh"
        variant="tonal"
        size="small"
        :loading="anyLoading"
        @click="refresh"
      >
        Làm mới
      </v-btn>
    </div>

    <!-- Filter bar -->
    <v-card class="pa-3 mb-4">
      <v-row dense align="center">
        <v-col cols="12" sm="6" md="4">
          <v-select
            v-model="filters.saleId"
            :items="saleOptions"
            item-title="text"
            item-value="value"
            :label="canMoveAny ? 'Sale phụ trách' : 'Deal của tôi'"
            density="compact"
            clearable
            hide-details
            :disabled="!canMoveAny"
            :hint="canMoveAny ? '' : 'Member chỉ xem deal được phân công'"
            persistent-hint
          />
        </v-col>
        <v-col cols="12" sm="6" md="4">
          <v-text-field
            v-model="filters.from"
            type="date"
            label="Từ ngày (theo updated_at)"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="4">
          <v-text-field
            v-model="filters.to"
            type="date"
            label="Đến ngày"
            density="compact"
            hide-details
          />
        </v-col>
      </v-row>
    </v-card>

    <!-- KPI metrics -->
    <PipelineMetricRow :metrics="metrics" class="mb-4" />

    <!-- Funnel -->
    <v-card class="pa-3 mb-4">
      <v-progress-linear v-if="loadingDeals" indeterminate color="primary" class="mb-3" />
      <PipelineFunnel
        :columns="columns"
        :can-move-any="canMoveAny"
        :current-user-id="authStore.user?.id ?? null"
        @move="handleMove"
      />
    </v-card>

    <!-- Stuck reasons -->
    <PipelineStuckReasons :reasons="stuckReasons" :loading="loadingReasons" />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3500">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PipelineMetricRow from '@/components/pipeline/PipelineMetricRow.vue';
import PipelineFunnel from '@/components/pipeline/PipelineFunnel.vue';
import PipelineStuckReasons from '@/components/pipeline/PipelineStuckReasons.vue';
import {
  STAGE_LABELS,
  usePipeline,
  type PipelineStage,
} from '@/composables/use-pipeline';
import { useUsers } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const canMoveAny = computed(
  () => authStore.user?.role === 'owner' || authStore.user?.role === 'admin',
);

const {
  filters,
  columns,
  metrics,
  stuckReasons,
  loadingDeals,
  loadingMetrics,
  loadingReasons,
  fetchAll,
  fetchDeals,
  moveStage,
} = usePipeline();

const { users, fetchUsers } = useUsers();

const saleOptions = computed(() =>
  (users.value ?? []).map((u: { id: string; fullName: string }) => ({
    text: u.fullName,
    value: u.id,
  })),
);

const anyLoading = computed(
  () => loadingDeals.value || loadingMetrics.value || loadingReasons.value,
);

const toast = ref({ show: false, text: '', color: 'success' as string });

let timer: ReturnType<typeof setTimeout> | null = null;
function debouncedRefresh() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => fetchAll(), 350);
}

watch(
  () => [filters.from, filters.to, filters.saleId],
  debouncedRefresh,
);

async function refresh() {
  await fetchAll();
  toast.value = { show: true, text: 'Đã cập nhật pipeline', color: 'success' };
}

async function handleMove(payload: {
  contactId: string;
  toStage: PipelineStage;
  reason?: string;
  rollback: () => void;
}) {
  try {
    await moveStage(payload.contactId, payload.toStage, payload.reason);
    toast.value = {
      show: true,
      text: `Đã chuyển sang "${STAGE_LABELS[payload.toStage]}"`,
      color: 'success',
    };
    // Re-pull deals so server state (incl. updated stageUpdatedAt → daysIdle
    // = 0, and the optimistic order reset) becomes the source of truth.
    await fetchDeals();
  } catch (err: any) {
    payload.rollback();
    const msg = err?.response?.data?.error ?? 'Không thể chuyển stage';
    toast.value = { show: true, text: msg, color: 'error' };
  }
}

onMounted(() => {
  fetchUsers().catch(() => {
    /* sale dropdown will just be empty */
  });
  fetchAll();
});
</script>

<style scoped>
.pipeline-view {
  max-width: 1800px;
  margin: 0 auto;
}
</style>
