<template>
  <div class="admin-dashboard">
    <div class="dashboard-header mb-4">
      <h1 class="text-h5">
        <v-icon class="mr-2" color="primary">mdi-view-dashboard-variant</v-icon>
        Tổng quan điều hành — <span class="text-primary">Tháng {{ monthDisplay }}</span>
      </h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Sức khoẻ hệ thống bán sỉ TPCN
      </p>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <!-- KHU 1: Hero KPI -->
    <AdminHeroKpi
      :kpi="heroKpi"
      class="mb-4"
      @open-pipeline="navigate('/reports/pipeline')"
    />

    <!-- KHU 2: Critical alerts -->
    <AdminCriticalAlerts
      :alerts="alerts"
      class="mb-4"
      @notify-sale="onNotifyVip"
      @open-pipeline="navigate('/reports/pipeline')"
      @open-ceo="navigate('/dashboard/ceo')"
    />

    <!-- KHU 3: Revenue trend -->
    <AdminRevenueTrend
      :data="revenueTrend"
      :group-by="groupBy"
      :trend-loading="trendLoading"
      class="mb-4"
      @change-group="changeGroupBy"
    />

    <!-- KHU 4: 2-col panels -->
    <AdminTwoColPanels
      :recent="recentAgents"
      :top-sales="topSales"
      class="mb-4"
      @open-contact="(id) => navigate('/contacts', { focus: id })"
      @open-contacts="navigate('/contacts')"
      @open-ceo="navigate('/dashboard/ceo')"
    />

    <!-- KHU 5: Quick links -->
    <AdminQuickLinks @navigate="navigate" />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AdminHeroKpi from './admin/AdminHeroKpi.vue';
import AdminCriticalAlerts from './admin/AdminCriticalAlerts.vue';
import AdminRevenueTrend from './admin/AdminRevenueTrend.vue';
import AdminTwoColPanels from './admin/AdminTwoColPanels.vue';
import AdminQuickLinks from './admin/AdminQuickLinks.vue';
import { useAdminDashboard } from '@/composables/use-admin-dashboard';
import { api } from '@/api/index';

const router = useRouter();

const monthDisplay = computed(() => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
});

const {
  loading,
  error,
  heroKpi,
  alerts,
  revenueTrend,
  recentAgents,
  topSales,
  groupBy,
  trendLoading,
  fetchAll,
  changeGroupBy,
} = useAdminDashboard();

const toast = ref({ show: false, text: '', color: 'success' as string });

function navigate(path: string, query?: Record<string, string>) {
  router.push({ path, query });
}

async function onNotifyVip(vip: { contactId: string; assignedUser: { id: string; fullName: string } | null; daysSinceLastOrder: number; fullName: string | null }) {
  if (!vip.assignedUser) return;
  try {
    await api.post('/dashboard/ceo/notify-sale', {
      contactId: vip.contactId,
      saleUserId: vip.assignedUser.id,
      message: `${vip.fullName ?? '(không tên)'} chưa đặt ${vip.daysSinceLastOrder}d — cần liên hệ ngay`,
    });
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

onMounted(fetchAll);
</script>

<style scoped>
.admin-dashboard {
  max-width: 1600px;
  margin: 0 auto;
}

.dashboard-header h1 {
  font-weight: 700;
}
</style>
