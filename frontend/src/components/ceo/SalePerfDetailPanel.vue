<template>
  <v-navigation-drawer
    v-model="open"
    location="right"
    width="520"
    temporary
    class="nds-sale-detail"
  >
    <template v-if="detail">
      <div class="pa-4 d-flex align-center" style="border-bottom: 1px solid var(--brand-navy-600);">
        <v-avatar size="40" color="brand-amber-500" class="mr-3">
          <span class="text-body-1">{{ initials(detail.current?.saleName) }}</span>
        </v-avatar>
        <div class="flex-grow-1">
          <div class="text-h6">{{ detail.current?.saleName ?? '—' }}</div>
          <div class="text-caption text-medium-emphasis">
            Score tháng:
            <span :style="{ color: scoreColor(detail.current?.overallScore ?? 0), fontWeight: 700 }">
              {{ detail.current?.overallScore.toFixed(0) ?? '—' }}
            </span>
          </div>
        </div>
        <v-btn icon variant="text" size="small" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>

      <div class="pa-4">
        <!-- Radar -->
        <div class="text-subtitle-2 mb-2">Biểu đồ năng lực</div>
        <SalePerfRadarChart v-if="detail.current" :sale="detail.current" class="mb-4" />

        <!-- 6-month history -->
        <div class="text-subtitle-2 mb-2">Score 6 tháng gần nhất</div>
        <div class="history-list mb-4">
          <div
            v-for="h in detail.history"
            :key="h.month"
            class="history-row"
          >
            <span class="history-row__month">{{ formatMonth(h.month) }}</span>
            <div class="history-row__bar">
              <div
                class="history-row__fill"
                :style="{ width: h.score + '%', background: scoreColor(h.score) }"
              />
            </div>
            <span
              class="history-row__value"
              :style="{ color: scoreColor(h.score) }"
            >{{ h.score.toFixed(0) }}</span>
          </div>
        </div>

        <!-- Top 5 agents -->
        <div class="text-subtitle-2 mb-2">Top 5 đại lý đang quản lý</div>
        <div v-if="detail.topAgents.length === 0" class="text-caption text-medium-emphasis pb-3">
          Chưa có đại lý chính thức.
        </div>
        <v-list v-else density="compact" nav class="pa-0 mb-3" bg-color="transparent">
          <v-list-item
            v-for="(a, i) in detail.topAgents"
            :key="a.contactId"
            density="compact"
            rounded="lg"
          >
            <template #prepend>
              <span class="text-caption text-medium-emphasis mr-2">{{ i + 1 }}.</span>
            </template>
            <v-list-item-title class="text-body-2">{{ a.fullName ?? '(không tên)' }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ formatVNDShort(a.lifetimeRevenue) }} ·
              <span :class="agentDaysClass(a.daysSinceLastOrder)">
                {{ formatDays(a.daysSinceLastOrder) }}
              </span>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <!-- Stuck deals -->
        <div class="text-subtitle-2 mb-2">Top 3 deal đang stuck</div>
        <div v-if="detail.stuckDeals.length === 0" class="text-caption text-medium-emphasis pb-3">
          Không có deal nào stuck — sạch sẽ!
        </div>
        <v-list v-else density="compact" nav class="pa-0 mb-3" bg-color="transparent">
          <v-list-item
            v-for="d in detail.stuckDeals"
            :key="d.contactId"
            density="compact"
            rounded="lg"
          >
            <v-list-item-title class="text-body-2">{{ d.fullName ?? '(không tên)' }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ stageLabel(d.stage) }} · stuck {{ d.daysIdle }} ngày
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <v-divider class="my-3" />

        <!-- Feedback -->
        <div class="text-subtitle-2 mb-2">Gửi feedback cho sale này</div>
        <v-textarea
          v-model="feedbackText"
          rows="3"
          auto-grow
          density="compact"
          variant="outlined"
          placeholder="Ghi chú riêng cho sale này — sẽ lưu vào activity log."
        />
        <v-btn
          color="primary"
          block
          :loading="sendingFeedback"
          :disabled="!feedbackText.trim()"
          prepend-icon="mdi-send"
          @click="onSendFeedback"
        >
          Gửi feedback
        </v-btn>
      </div>

      <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
        {{ toast.text }}
      </v-snackbar>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SalePerfRadarChart from './SalePerfRadarChart.vue';
import {
  formatVNDShort,
  scoreColor,
  type SaleDetail,
} from '@/composables/use-sale-performance';

interface Props {
  modelValue: boolean;
  detail: SaleDetail | null;
  sendingFeedback: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'send-feedback', saleId: string, message: string): Promise<void>;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const feedbackText = ref('');
const toast = ref({ show: false, text: '', color: 'success' as string });

watch(
  () => props.detail?.current?.saleId,
  () => {
    feedbackText.value = '';
  },
);

async function onSendFeedback() {
  const saleId = props.detail?.current?.saleId;
  if (!saleId || !feedbackText.value.trim()) return;
  try {
    await emit('send-feedback', saleId, feedbackText.value.trim());
    toast.value = {
      show: true,
      text: 'Đã gửi feedback',
      color: 'success',
    };
    feedbackText.value = '';
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Gửi thất bại',
      color: 'error',
    };
  }
}

function initials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
}

function formatDays(days: number | null): string {
  if (days == null) return 'chưa đặt';
  if (days <= 1) return 'hôm nay';
  return `${days} ngày`;
}

function agentDaysClass(days: number | null): string {
  if (days == null || days > 60) return 'text-error';
  if (days > 30) return 'text-warning';
  return 'text-success';
}

const STAGE_LABELS: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
  dai_ly_chinh_thuc: 'Đại lý chính thức',
  ngung: 'Ngừng',
};

function stageLabel(s: string): string {
  return STAGE_LABELS[s] ?? s;
}
</script>

<style scoped>
.nds-sale-detail :deep(.v-navigation-drawer__content) {
  background: var(--brand-navy-800);
}

.history-list { display: flex; flex-direction: column; gap: 6px; }

.history-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-row__month {
  font-size: 11px;
  color: var(--text-secondary);
  width: 36px;
  flex-shrink: 0;
}

.history-row__bar {
  flex: 1;
  height: 6px;
  background: var(--brand-navy-700);
  border-radius: 3px;
  overflow: hidden;
}

.history-row__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s var(--liquid-ease);
}

.history-row__value {
  font-weight: 700;
  font-size: 12px;
  width: 32px;
  text-align: right;
  flex-shrink: 0;
}
</style>
