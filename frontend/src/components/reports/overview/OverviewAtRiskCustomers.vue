<template>
  <section v-if="hasAnyContent" class="at-risk-grid">
    <!-- ── Customer care card (replaces "VIP sắp churn") ───────────── -->
    <div class="care-card">
      <header class="care-head">
        <span class="care-title">
          <span class="care-emoji">🎯</span>
          Khách hàng cần chăm sóc
        </span>
      </header>

      <!-- Group A: needCareNow (30-60d) — visible by default -->
      <div class="group group--need">
        <div class="group-head">
          <span class="dot dot--need" />
          <span class="group-label">Cần chăm ngay</span>
          <span class="group-sub">(30–60 ngày)</span>
          <span class="count-pill count-pill--need">{{ needCareNow.length }}</span>
        </div>

        <ul v-if="needCareNow.length" class="row-list">
          <li
            v-for="c in needCareNow"
            :key="c.contactId"
            class="row row--need"
            @click="goContact(c.contactId)"
          >
            <div class="row-info">
              <div class="row-name">{{ c.fullName }}</div>
              <div class="row-meta">
                <span v-if="c.province">{{ c.province }}</span>
                <span v-if="c.province" class="sep">·</span>
                <span class="lifetime">DS {{ formatVNDShort(c.lifetimeRevenue) }}</span>
                <span v-if="c.assignedSaleName" class="sep">·</span>
                <span v-if="c.assignedSaleName" class="sale">Sale: {{ c.assignedSaleName }}</span>
              </div>
            </div>
            <div class="days-pill days-pill--need" :title="`${c.daysInactive} ngày kể từ đơn cuối`">
              <span class="days-num">{{ c.daysInactive }}</span>
              <span class="days-unit">ngày</span>
            </div>
            <button
              type="button"
              class="cta-btn cta-btn--need"
              :disabled="!c.zaloUid && !c.phone"
              :title="c.zaloUid || c.phone ? 'Mở Zalo' : 'KH chưa có Zalo / SĐT'"
              @click.stop="contactZalo(c)"
            >
              <v-icon size="14">mdi-message-text-outline</v-icon>
              <span class="cta-label">Liên hệ Zalo ngay</span>
            </button>
          </li>
        </ul>
        <div v-else class="group-empty">
          Tất cả khách hàng đang khoẻ mạnh ✅
        </div>
      </div>

      <!-- Group B: longDormant (>60d) — collapsed by default -->
      <div v-if="longDormant.length" class="group group--dormant" :class="{ 'group--expanded': showDormant }">
        <button
          type="button"
          class="group-head group-head--toggle"
          :aria-expanded="showDormant"
          @click="showDormant = !showDormant"
        >
          <v-icon size="14" :class="{ 'rot-90': showDormant }">mdi-chevron-right</v-icon>
          <span class="dot dot--dormant" />
          <span class="group-label">Đã ngủ dài</span>
          <span class="group-sub">(&gt; 60 ngày)</span>
          <span class="count-pill count-pill--dormant">{{ longDormant.length }}</span>
        </button>

        <v-expand-transition>
          <ul v-if="showDormant" class="row-list row-list--dormant">
            <li
              v-for="c in longDormant"
              :key="c.contactId"
              class="row row--dormant"
              @click="goContact(c.contactId)"
            >
              <div class="row-info">
                <div class="row-name">{{ c.fullName }}</div>
                <div class="row-meta">
                  <span v-if="c.province">{{ c.province }}</span>
                  <span v-if="c.province" class="sep">·</span>
                  <span class="lifetime">DS {{ formatVNDShort(c.lifetimeRevenue) }}</span>
                  <span v-if="c.assignedSaleName" class="sep">·</span>
                  <span v-if="c.assignedSaleName" class="sale">Sale: {{ c.assignedSaleName }}</span>
                </div>
              </div>
              <div class="days-pill days-pill--dormant" :title="`${c.daysInactive} ngày kể từ đơn cuối`">
                <span class="days-num">{{ c.daysInactive }}</span>
                <span class="days-unit">ngày</span>
              </div>
              <button
                type="button"
                class="cta-btn cta-btn--dormant"
                @click.stop="goContact(c.contactId)"
              >
                <v-icon size="14">mdi-bookmark-plus-outline</v-icon>
                <span class="cta-label">Lưu vào kế hoạch</span>
              </button>
            </li>
          </ul>
        </v-expand-transition>
      </div>
    </div>

    <!-- ── Underperforming sales (kept from legacy critical-alerts) ── -->
    <div v-if="underperformingSales.length" class="alert-card alert-card--warn">
      <header class="alert-head">
        <span class="alert-title">
          <v-icon size="16" color="warning">mdi-trending-down</v-icon>
          Sale dưới chuẩn
        </span>
        <span class="count-pill count-pill--warn">{{ underperformingSales.length }}</span>
      </header>
      <ul class="alert-list">
        <li v-for="s in underperformingSales" :key="s.saleId" class="sale-alert-row">
          <div class="score-ring">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" stroke="rgba(245,158,11,0.15)" stroke-width="3" fill="none" />
              <circle
                cx="20"
                cy="20"
                r="16"
                :stroke="ringColor(s.score)"
                stroke-width="3"
                fill="none"
                stroke-linecap="round"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="circumference - (Math.max(0, Math.min(100, s.score)) / 100) * circumference"
                transform="rotate(-90 20 20)"
              />
              <text
                x="20"
                y="22"
                text-anchor="middle"
                :fill="ringColor(s.score)"
                font-size="11"
                font-weight="700"
                font-family="ui-monospace, monospace"
              >{{ Math.round(s.score) }}</text>
            </svg>
          </div>
          <div class="sale-info">
            <div class="name">{{ s.saleName }}</div>
            <div class="meta">DS resale tháng: {{ formatVNDShort(s.monthRevenue) }}</div>
          </div>
          <v-icon size="14" color="grey-lighten-1">mdi-chevron-right</v-icon>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  formatVNDShort,
  type AtRiskCustomer,
  type AtRiskCustomersResponse,
  type CriticalAlertsResponse,
} from '@/composables/use-overview-report';

interface Props {
  atRisk: AtRiskCustomersResponse | null;
  criticalAlerts: CriticalAlertsResponse | null;
}

const props = defineProps<Props>();

const needCareNow = computed(() => props.atRisk?.needCareNow ?? []);
const longDormant = computed(() => props.atRisk?.longDormant ?? []);
const underperformingSales = computed(() => props.criticalAlerts?.underperformingSales ?? []);

const hasAnyContent = computed(
  () =>
    needCareNow.value.length > 0 ||
    longDormant.value.length > 0 ||
    underperformingSales.value.length > 0,
);

const showDormant = ref(false);

const circumference = 2 * Math.PI * 16;

function ringColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

const router = useRouter();
function goContact(id: string) {
  router.push(`/contacts/${id}`);
}
function contactZalo(c: AtRiskCustomer) {
  // Prefer Zalo deeplink if present, fall back to chat page filtered by contact
  router.push(`/chat?contactId=${c.contactId}`);
}
</script>

<style scoped>
.at-risk-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 1024px) {
  .at-risk-grid {
    grid-template-columns: 1.6fr 1fr;
  }
}

/* ── Care card ──────────────────────────────────────────────────── */
.care-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.care-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.care-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f8fafc;
  letter-spacing: -0.01em;
}
.care-emoji {
  font-size: 1.05rem;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group--dormant {
  border-top: 1px dashed rgba(148, 163, 184, 0.18);
  padding-top: 12px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: #cbd5e1;
}
.group-head--toggle {
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 4px 0;
}
.group-head--toggle:hover .group-label {
  color: #f8fafc;
}
.rot-90 {
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.dot--need {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}
.dot--dormant {
  background: #94a3b8;
}
.group-label {
  font-weight: 600;
  color: #e2e8f0;
}
.group-sub {
  color: #64748b;
  font-size: 0.78rem;
}
.count-pill {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.count-pill--need {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
}
.count-pill--dormant {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}
.count-pill--warn {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
}

/* ── Row list ───────────────────────────────────────────────────── */
.row-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(148, 163, 184, 0.1);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.row:hover {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.05);
}
.row--dormant {
  opacity: 0.7;
}
.row--dormant:hover {
  opacity: 1;
}
.row-info {
  min-width: 0;
}
.row-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-meta {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 2px;
}
.row-meta .sep {
  margin: 0 4px;
  color: #475569;
}
.row-meta .lifetime {
  font-family: ui-monospace, monospace;
  color: #cbd5e1;
}
.row-meta .sale {
  color: #cbd5e1;
}

.days-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 10px;
  border-radius: 10px;
  min-width: 48px;
  flex: 0 0 auto;
}
.days-pill--need {
  background: rgba(245, 158, 11, 0.16);
  color: #fbbf24;
}
.days-pill--dormant {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}
.days-num {
  font-size: 0.95rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  line-height: 1;
}
.days-unit {
  font-size: 0.62rem;
  margin-top: 2px;
  opacity: 0.85;
}

.cta-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 500;
  transition: all 0.15s;
}
.cta-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cta-btn--need:not(:disabled):hover {
  background: #f97316;
  border-color: #f97316;
  color: #fff;
}
.cta-btn--dormant:hover {
  background: rgba(148, 163, 184, 0.14);
  border-color: rgba(148, 163, 184, 0.3);
}
.cta-label {
  white-space: nowrap;
}

.group-empty {
  font-size: 0.85rem;
  color: #64748b;
  text-align: center;
  padding: 18px;
  border: 1px dashed rgba(148, 163, 184, 0.18);
  border-radius: 10px;
}

/* ── Underperforming sales card (kept legacy) ───────────────────── */
.alert-card {
  background: rgb(var(--v-theme-surface));
  border-radius: 14px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  align-self: start;
}
.alert-card--warn {
  border-color: rgba(245, 158, 11, 0.25);
}
.alert-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.alert-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.alert-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sale-alert-row {
  display: grid;
  grid-template-columns: 40px 1fr 16px;
  gap: 10px;
  align-items: center;
  padding: 6px 6px;
  border-radius: 8px;
}
.sale-info .name {
  font-size: 0.85rem;
  color: #f8fafc;
  font-weight: 600;
}
.sale-info .meta {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 2px;
}

@media (max-width: 600px) {
  .row {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
  }
  .cta-btn {
    grid-column: 1 / span 2;
    justify-content: center;
  }
  .cta-label {
    display: inline;
  }
}
</style>
