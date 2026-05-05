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

    <!-- Default tabs: compact row layout -->
    <ul v-if="activeType !== 'at_risk'" class="customer-list">
      <li
        v-for="c in customers"
        :key="c.contactId"
        class="customer-row"
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
            <span v-if="c.province && c.orderCount" class="dot">•</span>
            <span v-if="c.orderCount">{{ c.orderCount }} đơn</span>
            <v-chip size="x-small" color="success" variant="tonal" class="status-chip">
              Active
            </v-chip>
          </div>
        </div>
        <div class="num-col">
          <div class="primary-num">{{ formatVNDShort(primaryValue(c)) }}</div>
          <div class="secondary-num">
            <v-icon size="11" :color="(c.profit ?? 0) >= 0 ? 'success' : 'error'">
              {{ (c.profit ?? 0) >= 0 ? 'mdi-arrow-up-bold' : 'mdi-arrow-down-bold' }}
            </v-icon>
            LN {{ formatVNDShort(c.profit ?? 0) }}
          </div>
        </div>
      </li>
    </ul>

    <!-- At-risk tab: card-per-VIP with red left border + full-width CTA -->
    <ul v-else class="atrisk-list">
      <li
        v-for="c in customers"
        :key="c.contactId"
        class="atrisk-card"
        @click="goContact(c.contactId)"
      >
        <div class="atrisk-head">
          <div class="atrisk-info">
            <div class="name" :title="c.fullName">{{ c.fullName }}</div>
            <div class="sub-meta">
              <span v-if="c.province">{{ c.province }}</span>
              <span v-if="c.province" class="dot">•</span>
              <span class="lifetime-tag">
                Lifetime {{ formatVNDShort(c.lifetimeRevenue ?? 0) }}
              </span>
            </div>
          </div>
          <div class="days-badge" :title="`${c.daysInactive} ngày chưa order`">
            <span class="days-num">{{ c.daysInactive ?? 0 }}</span>
            <span class="days-unit">ngày</span>
          </div>
        </div>
        <button
          type="button"
          class="contact-cta"
          :disabled="!c.zaloUid"
          :title="c.zaloUid ? 'Mở chat Zalo' : 'KH chưa có Zalo UID'"
          @click.stop="contactZalo(c)"
        >
          <v-icon size="15">mdi-message-text-outline</v-icon>
          Liên hệ Zalo ngay
        </button>
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
.rank-1 { background: rgba(254, 243, 199, 0.95); color: #78350F; }
.rank-2 { background: rgba(226, 232, 240, 0.92); color: #334155; }
.rank-3 { background: rgba(254, 215, 170, 0.92); color: #7C2D12; }
.rank-rest { background: rgba(51, 65, 85, 0.55); color: #94A3B8; }

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

/* ── At-risk card layout ── */
.atrisk-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.atrisk-card {
  background: rgba(127, 29, 29, 0.18);              /* red-950 / ~30% */
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-left: 3px solid #EF4444;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.atrisk-card:hover { background: rgba(127, 29, 29, 0.28); }

.atrisk-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.atrisk-info { min-width: 0; }
.lifetime-tag { color: #F59E0B; font-weight: 600; }

/* Big circular days-inactive badge */
.days-badge {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #DC2626, #B91C1C);
  color: #FEF2F2;
  font-family: ui-monospace, monospace;
  line-height: 1;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);
}
.days-num { font-size: 1.05rem; font-weight: 700; }
.days-unit { font-size: 0.55rem; opacity: 0.85; margin-top: 2px; letter-spacing: 0.05em; }

/* Full-width orange CTA */
.contact-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  background: #F97316;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.contact-cta:hover:not(:disabled) { background: #EA580C; }
.contact-cta:disabled { background: #475569; cursor: not-allowed; opacity: 0.7; }

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
