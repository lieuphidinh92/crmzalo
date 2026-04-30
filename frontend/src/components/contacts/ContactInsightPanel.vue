<template>
  <v-navigation-drawer
    v-model="open"
    location="right"
    width="480"
    temporary
    class="nds-insight-drawer"
  >
    <template v-if="contact">
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div class="pa-4 d-flex align-center" style="border-bottom: 1px solid var(--brand-navy-600);">
        <v-avatar size="48" color="brand-navy-600" class="mr-3">
          <v-img v-if="contact.avatarUrl" :src="contact.avatarUrl" />
          <v-icon v-else>mdi-account</v-icon>
        </v-avatar>
        <div class="flex-grow-1" style="min-width: 0;">
          <div class="text-h6 text-truncate">{{ contact.fullName || '(Chưa có tên)' }}</div>
          <div class="text-caption text-medium-emphasis">
            <v-chip v-if="customerTypeLabel" size="x-small" variant="tonal" class="mr-1">
              {{ customerTypeLabel }}
            </v-chip>
            <v-chip v-if="stageLabel" size="x-small" variant="tonal" :color="stageColor">
              {{ stageLabel }}
            </v-chip>
          </div>
        </div>
        <v-btn icon variant="text" size="small" @click="onClose">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>

      <div class="pa-4">
        <!-- ── Phone + Sale ─────────────────────────────────────────────── -->
        <div class="info-row">
          <div class="info-row__label">SĐT</div>
          <div class="info-row__value">
            <a
              v-if="contact.phone"
              href="#"
              class="phone-link"
              @click.prevent="$emit('open-chat', contact)"
            >
              <v-icon size="14" class="mr-1" color="primary">mdi-chat-processing</v-icon>
              {{ contact.phone }}
            </a>
            <span v-else class="text-disabled">—</span>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row__label">Sale phụ trách</div>
          <div class="info-row__value">{{ contact.assignedUser?.fullName || '—' }}</div>
        </div>
        <div v-if="contact.storeName" class="info-row">
          <div class="info-row__label">Cửa hàng</div>
          <div class="info-row__value">{{ contact.storeName }}</div>
        </div>
        <div v-if="contact.province" class="info-row">
          <div class="info-row__label">Tỉnh thành</div>
          <div class="info-row__value">{{ contact.province }}</div>
        </div>
        <div v-if="contact.policyTier" class="info-row">
          <div class="info-row__label">Chính sách</div>
          <div class="info-row__value">{{ policyTierLabel }}</div>
        </div>
        <div v-if="contact.scale" class="info-row">
          <div class="info-row__label">Quy mô</div>
          <div class="info-row__value">{{ scaleLabel }}</div>
        </div>
        <div v-if="contact.currentSupplier" class="info-row">
          <div class="info-row__label">Đang lấy hàng từ</div>
          <div class="info-row__value">{{ contact.currentSupplier }}</div>
        </div>
        <div v-if="contact.currentProducts && contact.currentProducts.length" class="info-row">
          <div class="info-row__label">SP đang bán</div>
          <div class="info-row__value">
            <v-chip
              v-for="p in contact.currentProducts"
              :key="p"
              size="x-small"
              variant="tonal"
              class="mr-1 mb-1"
            >{{ p }}</v-chip>
          </div>
        </div>
        <div v-if="contact.monthlyRevenueEstimate" class="info-row">
          <div class="info-row__label">Doanh số/tháng</div>
          <div class="info-row__value">{{ contact.monthlyRevenueEstimate }}</div>
        </div>
        <div v-if="contact.debtAmount" class="info-row">
          <div class="info-row__label">Công nợ</div>
          <div class="info-row__value">{{ formatCurrency(contact.debtAmount) }}</div>
        </div>
        <div v-if="contact.lastOrderDate" class="info-row">
          <div class="info-row__label">Đơn gần nhất</div>
          <div class="info-row__value">{{ formatDate(contact.lastOrderDate) }}</div>
        </div>
        <div v-if="contact.nextContactDate" class="info-row">
          <div class="info-row__label">Liên hệ tiếp theo</div>
          <div class="info-row__value">{{ formatDate(contact.nextContactDate) }}</div>
        </div>
        <div v-if="contact.stuckReason" class="info-row">
          <div class="info-row__label">Lý do chưa chốt</div>
          <div class="info-row__value">{{ contact.stuckReason }}</div>
        </div>

        <div class="mt-3 d-flex">
          <v-spacer />
          <v-btn
            size="small"
            variant="tonal"
            prepend-icon="mdi-pencil"
            @click="$emit('edit', contact)"
          >
            Chỉnh sửa
          </v-btn>
        </div>

        <v-divider class="my-4" />

        <!-- ── AI Insight section ──────────────────────────────────────── -->
        <div class="d-flex align-center mb-3">
          <v-icon icon="mdi-brain" color="primary" class="mr-2" />
          <div class="text-h6">AI Insight</div>
          <v-spacer />
          <v-btn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-refresh"
            :loading="loadingInsight"
            @click="onRefresh"
          >
            Cập nhật Insight
          </v-btn>
        </div>

        <div v-if="contact.aiInsightUpdatedAt" class="text-caption text-medium-emphasis mb-3">
          Cập nhật lần cuối: {{ formatDateTime(contact.aiInsightUpdatedAt) }}
        </div>

        <v-alert
          v-if="statusMessage"
          :type="statusType"
          variant="tonal"
          density="comfortable"
          class="mb-3"
        >
          {{ statusMessage }}
        </v-alert>

        <!-- Empty state -->
        <div
          v-if="!contact.aiInsight && !loadingInsight"
          class="empty-insight pa-4 text-center"
        >
          <v-icon size="48" color="grey-darken-1">mdi-creation</v-icon>
          <div class="text-body-2 mt-2 text-medium-emphasis">
            Chưa có insight cho khách hàng này.
          </div>
          <div class="text-caption text-medium-emphasis">
            Bấm "Cập nhật Insight" để AI phân tích lịch sử chat Zalo.
          </div>
        </div>

        <!-- Insight content -->
        <template v-if="insight">
          <!-- Temperature badge -->
          <div class="d-flex align-center mb-4">
            <span class="text-caption text-medium-emphasis mr-2">Nhiệt độ quan hệ:</span>
            <v-chip
              :color="temperatureColor"
              size="small"
              variant="flat"
              :prepend-icon="temperatureIcon"
            >
              {{ temperatureLabel }}
            </v-chip>
          </div>

          <!-- Summary -->
          <div v-if="insight.summary" class="insight-card mb-3">
            <div class="insight-card__title">
              <v-icon size="16" color="primary">mdi-text-box-outline</v-icon>
              Tóm tắt
            </div>
            <div class="text-body-2">{{ insight.summary }}</div>
          </div>

          <!-- Recommended actions — most important, highlight first -->
          <div
            v-if="insight.recommended_actions && insight.recommended_actions.length"
            class="insight-card insight-card--accent mb-3"
          >
            <div class="insight-card__title">
              <span style="font-size: 16px;">🎯</span>
              Hành động gợi ý
            </div>
            <ul class="insight-list">
              <li v-for="(item, i) in insight.recommended_actions" :key="i">
                {{ item }}
              </li>
            </ul>
          </div>

          <!-- Pain points -->
          <div
            v-if="insight.pain_points && insight.pain_points.length"
            class="insight-card mb-3"
          >
            <div class="insight-card__title">
              <span style="font-size: 16px;">⚠️</span>
              Nỗi đau / Vấn đề
            </div>
            <ul class="insight-list">
              <li v-for="(item, i) in insight.pain_points" :key="i">{{ item }}</li>
            </ul>
          </div>

          <!-- Buying signals -->
          <div
            v-if="insight.buying_signals && insight.buying_signals.length"
            class="insight-card mb-3"
          >
            <div class="insight-card__title">
              <span style="font-size: 16px;">✅</span>
              Tín hiệu mua hàng
            </div>
            <ul class="insight-list">
              <li v-for="(item, i) in insight.buying_signals" :key="i">{{ item }}</li>
            </ul>
          </div>

          <!-- Objections -->
          <div
            v-if="insight.objections && insight.objections.length"
            class="insight-card mb-3"
          >
            <div class="insight-card__title">
              <span style="font-size: 16px;">❌</span>
              Phản đối / Lo ngại
            </div>
            <ul class="insight-list">
              <li v-for="(item, i) in insight.objections" :key="i">{{ item }}</li>
            </ul>
          </div>

          <!-- Best time -->
          <div
            v-if="insight.best_time_to_contact"
            class="insight-card mb-3"
          >
            <div class="insight-card__title">
              <v-icon size="16" color="primary">mdi-clock-outline</v-icon>
              Thời điểm liên hệ tốt nhất
            </div>
            <div class="text-body-2">{{ insight.best_time_to_contact }}</div>
          </div>
        </template>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  CUSTOMER_TYPE_OPTIONS,
  STAGE_OPTIONS,
  SCALE_OPTIONS,
  POLICY_TIER_OPTIONS,
  useContacts,
  type AIInsight,
  type Contact,
} from '@/composables/use-contacts';

interface Props {
  modelValue: boolean;
  contact: Contact | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'edit', contact: Contact): void;
  (e: 'open-chat', contact: Contact): void;
  (e: 'updated', contact: Partial<Contact>): void;
}>();

const { refreshAiInsight } = useContacts();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const loadingInsight = ref(false);
const statusMessage = ref('');
const statusType = ref<'info' | 'success' | 'warning' | 'error'>('info');

watch(
  () => props.contact?.id,
  () => {
    statusMessage.value = '';
  },
);

const insight = computed<AIInsight | null>(() => {
  return (props.contact?.aiInsight as AIInsight | null) ?? null;
});

// ── Label helpers ──────────────────────────────────────────────────────
const customerTypeLabel = computed(
  () =>
    CUSTOMER_TYPE_OPTIONS.find((o) => o.value === props.contact?.customerType)
      ?.text || '',
);

const stageLabel = computed(
  () =>
    STAGE_OPTIONS.find((o) => o.value === props.contact?.stage)?.text || '',
);

const stageColor = computed(() => {
  const map: Record<string, string> = {
    tiep_can: 'grey',
    da_bao_gia: 'info',
    dang_thu_hang: 'warning',
    dai_ly_chinh_thuc: 'success',
    ngung: 'error',
  };
  return map[props.contact?.stage ?? ''] ?? 'grey';
});

const scaleLabel = computed(
  () =>
    SCALE_OPTIONS.find((o) => o.value === props.contact?.scale)?.text || '',
);

const policyTierLabel = computed(
  () =>
    POLICY_TIER_OPTIONS.find((o) => o.value === props.contact?.policyTier)
      ?.text || '',
);

// ── Temperature badge ─────────────────────────────────────────────────
const temperatureColor = computed(() => {
  const t = (insight.value?.relationship_temperature ?? '').toLowerCase();
  if (t === 'hot') return 'error';
  if (t === 'warm') return 'warning';
  if (t === 'cold') return 'grey-darken-1';
  return 'grey';
});

const temperatureIcon = computed(() => {
  const t = (insight.value?.relationship_temperature ?? '').toLowerCase();
  if (t === 'hot') return 'mdi-fire';
  if (t === 'warm') return 'mdi-thermometer';
  if (t === 'cold') return 'mdi-snowflake';
  return 'mdi-help-circle-outline';
});

const temperatureLabel = computed(() => {
  const t = (insight.value?.relationship_temperature ?? '').toLowerCase();
  if (t === 'hot') return 'Nóng — sẵn sàng chốt';
  if (t === 'warm') return 'Ấm — đang cân nhắc';
  if (t === 'cold') return 'Lạnh — chưa quan tâm';
  return 'Chưa rõ';
});

// ── Actions ────────────────────────────────────────────────────────────
async function onRefresh() {
  if (!props.contact) return;
  loadingInsight.value = true;
  statusMessage.value = '';
  try {
    const res = await refreshAiInsight(props.contact.id);
    if (res.status === 'unchanged') {
      statusMessage.value = res.message ?? 'Chưa có tin nhắn mới kể từ lần cập nhật trước.';
      statusType.value = 'info';
    } else if (res.status === 'no_messages') {
      statusMessage.value = res.message ?? 'Khách hàng này chưa có tin nhắn nào để phân tích.';
      statusType.value = 'warning';
    } else {
      statusMessage.value =
        res.status === 'created'
          ? 'Đã tạo insight đầu tiên.'
          : 'Đã cập nhật insight với tin nhắn mới.';
      statusType.value = 'success';
    }
    // Tell parent to refresh the contact so aiInsight + timestamp re-render
    emit('updated', {
      aiInsight: res.insight ?? undefined,
      aiInsightUpdatedAt: res.updatedAt ?? undefined,
    });
  } catch (err: any) {
    statusMessage.value = err?.response?.data?.error ?? 'Cập nhật thất bại';
    statusType.value = 'error';
  } finally {
    loadingInsight.value = false;
  }
}

function onClose() {
  open.value = false;
}

// ── Formatters ────────────────────────────────────────────────────────
function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN');
}

function formatCurrency(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(n);
}
</script>

<style scoped>
.nds-insight-drawer :deep(.v-navigation-drawer__content) {
  background: var(--brand-navy-800);
}

.info-row {
  display: flex;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid rgba(30, 52, 88, 0.5);
}

.info-row:last-of-type {
  border-bottom: none;
}

.info-row__label {
  width: 130px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.info-row__value {
  flex: 1;
  color: var(--text-primary);
  word-break: break-word;
}

.phone-link {
  display: inline-flex;
  align-items: center;
  color: var(--brand-amber-500);
  text-decoration: none;
  font-weight: 500;
}

.phone-link:hover {
  text-decoration: underline;
}

.empty-insight {
  border: 1px dashed var(--brand-navy-500);
  border-radius: 12px;
  background: var(--brand-navy-700);
}

.insight-card {
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 12px;
  padding: 12px 14px;
}

.insight-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.insight-card--accent {
  border-color: var(--brand-amber-500);
  background: rgba(245, 158, 11, 0.06);
}

.insight-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
}

.insight-list li {
  margin-bottom: 4px;
}
</style>
