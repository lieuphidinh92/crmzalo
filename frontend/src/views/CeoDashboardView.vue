<template>
  <div class="ceo-dashboard">
    <!-- Header -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2 no-print">
      <h1 class="text-h5">
        <v-icon class="mr-2" color="primary">mdi-view-dashboard-variant</v-icon>
        Dashboard CEO
      </h1>
      <span class="text-caption text-medium-emphasis">
        Sức khoẻ toàn hệ thống bán sỉ TPCN
      </span>
      <v-spacer />
      <v-btn
        prepend-icon="mdi-refresh"
        variant="tonal"
        size="small"
        :loading="loading"
        @click="fetchAll"
      >
        Làm mới
      </v-btn>
      <v-btn
        prepend-icon="mdi-printer-outline"
        color="primary"
        variant="tonal"
        size="small"
        @click="printPdf"
      >
        Xuất PDF
      </v-btn>
    </div>

    <!-- Print-only header -->
    <div class="print-only print-header">
      <h1>Dashboard CEO — ngheduocsi.vn</h1>
      <div class="text-caption">{{ printDate }}</div>
    </div>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-4"
    >
      {{ error }}
    </v-alert>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <!-- KHU 1: KPI -->
    <CeoKpiCards :kpi="kpi" class="mb-4 page-break-avoid" />

    <!-- KHU 2: Pareto -->
    <CeoParetoChart :pareto="pareto" class="mb-4 page-break-after" />

    <!-- KHU 3: Cohort -->
    <CeoCohortRetention :cohort="cohort" class="mb-4 page-break-after" />

    <!-- KHU 4: Segment revenue -->
    <CeoSegmentRevenueChart :segments="segments" class="mb-4 page-break-avoid" />

    <!-- KHU 5: Sale performance evaluation (replaces simpler version) -->
    <SalePerformanceSection class="mb-4 page-break-avoid" />

    <!-- KHU 6: VIP at-risk — moved AFTER sale-perf so CEO sees the
         "who needs intervention" prompt right next to the rescue list. -->
    <CeoAtRiskVips
      :vips="(vips as AtRiskVipMutable[])"
      :notifying="notifying"
      class="mb-4 page-break-avoid"
      @notify="handleNotify"
    />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import CeoKpiCards from '@/components/ceo/CeoKpiCards.vue';
import CeoParetoChart from '@/components/ceo/CeoParetoChart.vue';
import CeoCohortRetention from '@/components/ceo/CeoCohortRetention.vue';
import CeoSegmentRevenueChart from '@/components/ceo/CeoSegmentRevenueChart.vue';
import CeoAtRiskVips from '@/components/ceo/CeoAtRiskVips.vue';
import SalePerformanceSection from '@/components/ceo/SalePerformanceSection.vue';
import {
  useCeoDashboard,
  type AtRiskVip,
} from '@/composables/use-ceo-dashboard';

type AtRiskVipMutable = AtRiskVip;

const {
  kpi,
  pareto,
  cohort,
  segments,
  vips,
  loading,
  error,
  notifying,
  fetchAll,
  notifySale,
} = useCeoDashboard();

const toast = ref({ show: false, text: '', color: 'success' as string });

const printDate = computed(() =>
  new Date().toLocaleString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
);

async function handleNotify(vip: AtRiskVip) {
  if (!vip.assignedUser) {
    toast.value = {
      show: true,
      text: 'Đại lý này chưa có sale phụ trách',
      color: 'warning',
    };
    return;
  }
  try {
    await notifySale(
      vip.contactId,
      vip.assignedUser.id,
      `${vip.fullName ?? '(không tên)'} chưa đặt hàng ${vip.daysSinceLastOrder} ngày — cần liên hệ ngay`,
    );
    toast.value = {
      show: true,
      text: `Đã báo ${vip.assignedUser.fullName}`,
      color: 'success',
    };
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Gửi thất bại',
      color: 'error',
    };
  }
}

function printPdf() {
  // Browsers offer "Save as PDF" in the print dialog. The @media print
  // CSS below hides chrome and lays out for paper.
  window.print();
}

onMounted(fetchAll);
</script>

<style scoped>
.ceo-dashboard {
  max-width: 1600px;
  margin: 0 auto;
}

.print-only { display: none; }

@media print {
  .no-print { display: none !important; }
  .print-only { display: block; }

  .print-header {
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #ccc;
  }

  .ceo-dashboard {
    max-width: none;
    color: #000;
  }

  /* Force light theme on print */
  :deep(.v-card),
  :deep(.v-table),
  :deep(.cohort-cell) {
    color: #000 !important;
    background: #fff !important;
    border-color: #ccc !important;
    box-shadow: none !important;
  }

  :deep(.cohort-row-label),
  :deep(.cohort-row-size),
  :deep(.cohort-head) {
    background: #f3f4f6 !important;
    color: #111 !important;
  }

  .page-break-after { page-break-after: always; }
  .page-break-avoid { page-break-inside: avoid; }
}
</style>
