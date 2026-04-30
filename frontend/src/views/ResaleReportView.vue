<template>
  <div class="resale-report">
    <!-- Page header -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5">
        <v-icon class="mr-2" color="primary">mdi-trending-up</v-icon>
        Báo cáo Resale
      </h1>
      <span class="text-caption text-medium-emphasis">
        Hiệu quả đặt hàng định kỳ của đại lý chính thức
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
        <v-col cols="12" sm="6" md="3">
          <v-text-field
            v-model="filters.from"
            type="date"
            label="Từ ngày"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-text-field
            v-model="filters.to"
            type="date"
            label="Đến ngày"
            density="compact"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-select
            v-model="filters.saleId"
            :items="saleOptions"
            item-title="text"
            item-value="value"
            label="Sale phụ trách"
            density="compact"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-select
            v-model="filters.type"
            :items="customerTypeOptions"
            item-title="text"
            item-value="value"
            label="Loại đại lý"
            density="compact"
            clearable
            hide-details
          />
        </v-col>
      </v-row>
    </v-card>

    <!-- KPI cards -->
    <ResaleKpiCards
      :overview="overview"
      class="mb-4"
      @open-at-risk="openSegment"
    />

    <!-- Charts -->
    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <ResaleWeeklyChart :weekly="overview?.weeklyRevenue ?? []" />
      </v-col>
      <v-col cols="12" md="4">
        <ResaleTypeShareChart :type-share="overview?.typeShare ?? []" />
      </v-col>
    </v-row>

    <!-- Segments + Top agents -->
    <v-row>
      <v-col cols="12" lg="7">
        <ResaleSegmentsTable
          :segments="segments"
          :loading="loadingSegments"
          @open-segment="openSegment"
        />
      </v-col>
      <v-col cols="12" lg="5">
        <ResaleTopAgents
          :top-agents="topAgents"
          :loading="loadingTop"
          @open-agent="openAgent"
        />
      </v-col>
    </v-row>

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ResaleKpiCards from '@/components/reports/ResaleKpiCards.vue';
import ResaleSegmentsTable from '@/components/reports/ResaleSegmentsTable.vue';
import ResaleTopAgents from '@/components/reports/ResaleTopAgents.vue';
import ResaleWeeklyChart from '@/components/reports/ResaleWeeklyChart.vue';
import ResaleTypeShareChart from '@/components/reports/ResaleTypeShareChart.vue';
import { useResaleReport } from '@/composables/use-resale-report';
import { useUsers } from '@/composables/use-users';

const router = useRouter();

const {
  filters,
  overview,
  segments,
  topAgents,
  loadingOverview,
  loadingSegments,
  loadingTop,
  fetchAll,
} = useResaleReport();

const { users, fetchUsers } = useUsers();

const customerTypeOptions = [
  { text: 'Nhà thuốc', value: 'nha_thuoc' },
  { text: 'Sỉ online', value: 'si_online' },
  { text: 'Dược sĩ tự do', value: 'duoc_si' },
  { text: 'Cửa hàng mẹ bé', value: 'cua_hang_me_be' },
];

const saleOptions = computed(() =>
  (users.value ?? []).map((u: { id: string; fullName: string }) => ({
    text: u.fullName,
    value: u.id,
  })),
);

const anyLoading = computed(
  () => loadingOverview.value || loadingSegments.value || loadingTop.value,
);

const toast = ref({ show: false, text: '', color: 'success' as string });

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => fetchAll(), 350);
}

watch(
  () => [filters.from, filters.to, filters.saleId, filters.type],
  debouncedRefresh,
);

async function refresh() {
  await fetchAll();
  toast.value = { show: true, text: 'Đã cập nhật báo cáo', color: 'success' };
}

function openSegment(segmentKey: string) {
  router.push({
    path: '/reports/resale/at-risk',
    query: {
      segment: segmentKey,
      from: filters.from,
      to: filters.to,
      saleId: filters.saleId ?? undefined,
      type: filters.type ?? undefined,
    },
  });
}

function openAgent(contactId: string) {
  // Reuse Contacts page with ?focus=<id> if we add deeplink later. For
  // now, navigate to /contacts; the staff can then click the row.
  router.push({ path: '/contacts', query: { focus: contactId } });
}

onMounted(() => {
  fetchUsers().catch(() => {
    /* not fatal — sale dropdown will be empty */
  });
  fetchAll();
});
</script>

<style scoped>
.resale-report {
  max-width: 1600px;
  margin: 0 auto;
}
</style>
