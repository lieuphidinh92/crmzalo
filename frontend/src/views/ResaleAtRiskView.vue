<template>
  <div class="resale-at-risk">
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        size="small"
        @click="$router.push('/reports/resale')"
      />
      <h1 class="text-h5">
        Đại lý —
        <span :class="segmentColorClass">{{ segmentLabel }}</span>
      </h1>
      <v-chip v-if="agents.length" size="small" variant="tonal" class="ml-2">
        {{ agents.length }} đại lý
      </v-chip>
      <v-spacer />
      <v-btn
        prepend-icon="mdi-refresh"
        variant="tonal"
        size="small"
        :loading="loading"
        @click="load"
      >
        Làm mới
      </v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <v-card v-if="!loading && agents.length === 0" class="pa-12 text-center">
      <v-icon size="64" color="grey-darken-1">mdi-emoticon-cool-outline</v-icon>
      <div class="text-h6 mt-3">Không có đại lý nào trong nhóm này</div>
      <div class="text-body-2 text-medium-emphasis mt-1">
        Tin tốt — thử filter khác hoặc về trang tổng quan.
      </div>
    </v-card>

    <v-card v-else-if="agents.length">
      <v-table density="comfortable" hover>
        <thead>
          <tr>
            <th>Đại lý</th>
            <th>SĐT</th>
            <th>Loại</th>
            <th>Sale</th>
            <th>Đơn cuối</th>
            <th class="text-right">Tổng DS</th>
            <th class="text-right">Hành động</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agent in agents" :key="agent.contactId">
            <td>
              <div class="font-weight-medium">{{ agent.fullName || '(không tên)' }}</div>
              <div v-if="agent.storeName" class="text-caption text-medium-emphasis">
                {{ agent.storeName }}
              </div>
            </td>
            <td>
              <a
                v-if="agent.phone"
                href="#"
                class="phone-link"
                @click.prevent="openZaloChat(agent)"
              >
                <v-icon size="14" class="mr-1">mdi-chat-processing</v-icon>
                {{ agent.phone }}
              </a>
              <span v-else class="text-medium-emphasis">—</span>
            </td>
            <td>
              <v-chip v-if="agent.customerType" size="x-small" variant="tonal" color="info">
                {{ customerTypeLabel(agent.customerType) }}
              </v-chip>
              <span v-else class="text-medium-emphasis">—</span>
            </td>
            <td class="text-medium-emphasis">{{ agent.assignedUser?.fullName ?? '—' }}</td>
            <td>
              <span v-if="agent.daysSinceLastOrder >= 99999" class="text-medium-emphasis">Chưa có</span>
              <span
                v-else
                :class="agent.daysSinceLastOrder > 60 ? 'text-error' : 'text-warning'"
              >
                {{ agent.daysSinceLastOrder }} ngày trước
              </span>
            </td>
            <td class="text-right font-weight-medium">{{ formatVND(agent.totalRevenue) }}</td>
            <td class="text-right">
              <v-btn
                size="x-small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-chat-processing"
                class="mr-1"
                :disabled="!agent.phone"
                @click="openZaloChat(agent)"
              >
                Zalo
              </v-btn>
              <v-btn
                size="x-small"
                variant="tonal"
                prepend-icon="mdi-brain"
                @click="openInsight(agent.contactId)"
              >
                Insight
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  formatVND,
  useResaleReport,
  type AtRiskAgent,
} from '@/composables/use-resale-report';
import { useContacts } from '@/composables/use-contacts';

const route = useRoute();
const router = useRouter();

const { filters, fetchAtRisk } = useResaleReport();
const { fetchContactConversations } = useContacts();

const agents = ref<AtRiskAgent[]>([]);
const loading = ref(false);
const toast = ref({ show: false, text: '', color: 'success' as string });

const segmentKey = computed(() => (route.query.segment as string) || 'warning');

const SEGMENT_LABELS: Record<string, string> = {
  just_ordered: 'Vừa đặt (0-15 ngày)',
  remind: 'Cần nhắc (16-30 ngày)',
  warning: 'Cảnh báo (31-45 ngày)',
  pre_churn: 'Sắp churn (46-60 ngày)',
  pre_churn_heavy: 'Sắp churn nặng (61-90 ngày)',
  churned: 'Đã churn (>90 ngày)',
};

const segmentLabel = computed(
  () => SEGMENT_LABELS[segmentKey.value] ?? 'Cần chăm',
);

const segmentColorClass = computed(() => {
  if (['churned', 'pre_churn_heavy'].includes(segmentKey.value))
    return 'text-error';
  if (['pre_churn', 'warning'].includes(segmentKey.value))
    return 'text-warning';
  return 'text-primary';
});

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Mẹ bé',
};

function customerTypeLabel(t: string): string {
  return CUSTOMER_TYPE_LABELS[t] ?? t;
}

async function load() {
  // Sync filters from query params so the same filters apply across pages.
  if (route.query.from) filters.from = route.query.from as string;
  if (route.query.to) filters.to = route.query.to as string;
  filters.saleId = (route.query.saleId as string) || null;
  filters.type = (route.query.type as string) || null;

  loading.value = true;
  try {
    agents.value = await fetchAtRisk(segmentKey.value);
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Lỗi tải danh sách',
      color: 'error',
    };
  } finally {
    loading.value = false;
  }
}

async function openZaloChat(agent: AtRiskAgent) {
  try {
    const conversations = await fetchContactConversations(agent.contactId);
    if (!conversations.length) {
      toast.value = {
        show: true,
        text: 'Chưa có hội thoại với khách này',
        color: 'warning',
      };
      return;
    }
    router.push({
      path: '/chat',
      query: { conversationId: conversations[0].id },
    });
  } catch {
    toast.value = {
      show: true,
      text: 'Không tìm được hội thoại',
      color: 'error',
    };
  }
}

function openInsight(contactId: string) {
  // Hand off to Contacts page; staff can click the row to open the panel.
  router.push({ path: '/contacts', query: { focus: contactId } });
}

watch(segmentKey, load);
onMounted(load);
</script>

<style scoped>
.phone-link {
  color: var(--brand-amber-500);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  font-weight: 500;
}

.phone-link:hover {
  text-decoration: underline;
}

.resale-at-risk {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
