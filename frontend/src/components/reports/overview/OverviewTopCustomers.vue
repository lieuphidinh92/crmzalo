<template>
  <v-card
    class="overview-card pa-3 h-100"
    :class="{ 'overview-card--warn': activeType === 'at_risk' }"
    variant="flat"
  >
    <div class="d-flex align-start mb-3">
      <div>
        <div class="d-flex align-center">
          <v-icon icon="mdi-account-star-outline" color="primary" class="mr-2" />
          <span class="text-h6">Top khách hàng</span>
        </div>
        <div class="text-caption text-medium-emphasis">5 KH dẫn đầu theo tab đã chọn</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tab-bar" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.value"
        type="button"
        role="tab"
        :aria-selected="activeType === t.value"
        :class="['tab', activeType === t.value && 'tab--active', t.value === 'at_risk' && 'tab--warn']"
        @click="onTab(t.value)"
      >
        {{ t.label }}
        <v-icon v-if="t.value === 'at_risk'" size="13" class="ml-1">mdi-alert-circle-outline</v-icon>
      </button>
    </div>

    <div v-if="loading" class="loading-list">
      <div v-for="n in 5" :key="n" class="row-skeleton" />
    </div>

    <div v-else-if="!customers.length" class="empty-state">
      <v-icon size="44" color="grey-darken-1">{{ emptyIcon }}</v-icon>
      <div class="mt-2">{{ emptyText }}</div>
    </div>

    <ul v-else class="customer-list">
      <li
        v-for="c in customers"
        :key="c.contactId"
        :class="['customer-row', c.atRisk && 'customer-row--warn']"
        @click="goContact(c.contactId)"
      >
        <div class="rank-col">
          <span :class="['rank-badge', `rank-${c.rank <= 3 ? c.rank : 'rest'}`]">
            {{ c.rank }}
          </span>
        </div>
        <div class="info-col">
          <div class="name" :title="c.fullName">{{ c.fullName }}</div>
          <div class="sub-meta">
            <span v-if="c.province">{{ c.province }}</span>
            <span v-if="c.province && (c.orderCount || c.daysInactive)" class="dot">•</span>
            <span v-if="c.orderCount">{{ c.orderCount }} đơn</span>
            <v-chip
              v-if="!c.atRisk"
              size="x-small"
              color="success"
              variant="tonal"
              class="status-chip"
            >Active</v-chip>
            <v-chip
              v-else
              size="x-small"
              color="error"
              variant="flat"
              class="status-chip"
            >
              <v-icon size="11" start>mdi-clock-alert-outline</v-icon>
              {{ c.daysInactive }}d không order
            </v-chip>
          </div>
        </div>
        <div class="num-col">
          <div class="primary-num">{{ formatVNDShort(primaryValue(c)) }}</div>
          <div v-if="!c.atRisk" class="secondary-num">
            <v-icon size="11" :color="c.profit && c.profit >= 0 ? 'success' : 'error'">
              {{ c.profit && c.profit >= 0 ? 'mdi-arrow-up-bold' : 'mdi-arrow-down-bold' }}
            </v-icon>
            LN {{ formatVNDShort(c.profit ?? 0) }}
          </div>
          <div v-else class="secondary-num lifetime">
            Lifetime {{ formatVNDShort(c.lifetimeRevenue ?? 0) }}
          </div>
        </div>
        <div v-if="c.atRisk" class="action-col" @click.stop>
          <v-btn
            size="x-small"
            color="error"
            variant="flat"
            icon="mdi-message-text-outline"
            :disabled="!c.zaloUid"
            :title="c.zaloUid ? 'Mở chat Zalo với KH này' : 'KH chưa có Zalo UID'"
            class="zalo-btn-mobile"
            @click="contactZalo(c)"
          />
          <v-btn
            size="x-small"
            color="error"
            variant="flat"
            prepend-icon="mdi-message-text-outline"
            :disabled="!c.zaloUid"
            :title="c.zaloUid ? 'Mở chat Zalo với KH này' : 'KH chưa có Zalo UID'"
            class="zalo-btn-desktop"
            @click="contactZalo(c)"
          >
            Liên hệ
          </v-btn>
        </div>
      </li>
    </ul>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  formatVNDShort,
  type TopCustomerRow,
} from '@/composables/use-overview-report';

type CustomerType = 'revenue' | 'resale' | 'profit' | 'at_risk';

const TABS: ReadonlyArray<{ value: CustomerType; label: string }> = [
  { value: 'revenue', label: 'Doanh số' },
  { value: 'resale', label: 'Resale' },
  { value: 'profit', label: 'Lợi nhuận' },
  { value: 'at_risk', label: 'Sắp mất' },
];

interface Props {
  customers: TopCustomerRow[];
  loading: boolean;
  activeType: CustomerType;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'change-type', type: CustomerType): void;
}>();

const router = useRouter();

const emptyIcon = computed(() =>
  props.activeType === 'at_risk' ? 'mdi-shield-check-outline' : 'mdi-account-multiple-outline',
);
const emptyText = computed(() =>
  props.activeType === 'at_risk'
    ? 'Không có VIP nào sắp mất 🎉'
    : 'Chưa có dữ liệu trong kỳ này',
);

function onTab(t: CustomerType) {
  if (t === props.activeType) return;
  emit('change-type', t);
}

function primaryValue(c: TopCustomerRow): number {
  if (props.activeType === 'profit') return c.profit ?? 0;
  if (props.activeType === 'at_risk') return c.lifetimeRevenue ?? 0;
  return c.revenue ?? 0;
}

function goContact(id: string) {
  router.push(`/contacts/${id}`);
}

function contactZalo(c: TopCustomerRow) {
  if (!c.zaloUid) return;
  // Existing chat route: open the conversation list filtered by this UID.
  // If a richer deep-link is added later, swap here.
  router.push(`/chat?contactId=${c.contactId}`);
}
</script>

<style scoped>
.overview-card {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  transition: border-color 0.2s, background 0.2s;
}
.overview-card--warn {
  border-color: rgba(239, 68, 68, 0.25);
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.04) 0%, rgb(var(--v-theme-surface)) 80%) !important;
}

/* Tabs */
.tab-bar {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
  margin-bottom: 12px;
  padding-bottom: 2px;
}
.tab-bar::-webkit-scrollbar { height: 3px; }
.tab {
  flex: 0 0 auto;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: transparent;
  color: rgb(148, 163, 184);
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}
.tab:hover {
  color: rgb(248, 250, 252);
  border-color: rgba(245, 158, 11, 0.4);
}
.tab--active {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgb(245, 158, 11);
  color: rgb(245, 158, 11);
}
.tab--active.tab--warn {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgb(239, 68, 68);
  color: rgb(239, 68, 68);
}

/* Rows */
.customer-list { list-style: none; padding: 0; margin: 0; }
.customer-row {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05);
  cursor: pointer;
  transition: background 0.12s;
}
.customer-row:hover { background: rgba(148, 163, 184, 0.04); }
.customer-row:last-child { border-bottom: none; }
.customer-row--warn {
  grid-template-columns: 28px 1fr auto auto;
}

.rank-col { display: flex; justify-content: center; }
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.78rem;
  font-family: ui-monospace, monospace;
}
.rank-1 { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1e293b; }
.rank-2 { background: linear-gradient(135deg, #cbd5e1, #94a3b8); color: #1e293b; }
.rank-3 { background: linear-gradient(135deg, #d97706, #b45309); color: #fff; }
.rank-rest { background: rgba(148, 163, 184, 0.15); color: rgb(var(--v-theme-on-surface)); opacity: 0.7; }

.info-col { min-width: 0; }
.name {
  font-weight: 500;
  font-size: 0.9rem;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub-meta {
  font-size: 0.72rem;
  color: rgb(148, 163, 184);
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.sub-meta .dot { opacity: 0.6; }
.status-chip { margin-left: 4px; }

.num-col {
  text-align: right;
  font-family: ui-monospace, monospace;
}
.primary-num {
  font-weight: 700;
  font-size: 0.95rem;
  color: rgb(var(--v-theme-on-surface));
}
.secondary-num {
  font-size: 0.72rem;
  margin-top: 2px;
  color: rgb(148, 163, 184);
}
.lifetime { color: rgb(245, 158, 11); }

.action-col { padding-left: 4px; }

/* Show icon-only button on narrow phones, full label on tablet+ */
.zalo-btn-mobile { display: inline-flex; }
.zalo-btn-desktop { display: none; }
@media (min-width: 600px) {
  .zalo-btn-mobile { display: none; }
  .zalo-btn-desktop { display: inline-flex; }
}

.empty-state {
  text-align: center;
  padding: 32px 12px;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.6;
}

.loading-list { display: flex; flex-direction: column; gap: 12px; }
.row-skeleton {
  height: 56px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.06) 0%,
    rgba(148, 163, 184, 0.14) 50%,
    rgba(148, 163, 184, 0.06) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 8px;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
