<template>
  <!-- Show nothing when both lists empty (per spec: hide card hoàn toàn) -->
  <div v-if="hasAnyAlert" class="alerts-grid">
    <!-- VIP at-risk card -->
    <div v-if="vipAtRisk.length" class="alert-card alert-card--danger">
      <header class="alert-head">
        <span class="alert-title">
          <v-icon size="16" color="error">mdi-alert-octagram-outline</v-icon>
          VIP sắp churn
        </span>
        <span class="count-pill count-pill--danger">{{ vipAtRisk.length }}</span>
      </header>
      <ul class="alert-list">
        <li v-for="v in vipAtRisk" :key="v.contactId" class="vip-row" @click="goContact(v.contactId)">
          <div class="vip-info">
            <div class="name">{{ v.fullName }}</div>
            <div class="meta">
              <span v-if="v.province">{{ v.province }}</span>
              <span v-if="v.province" class="dot">•</span>
              <span class="lifetime-amt">DS {{ formatVNDShort(v.lifetimeRevenue) }}</span>
            </div>
          </div>
          <div class="days-pill" :title="`${v.daysInactive} ngày chưa order`">
            <span class="days-num">{{ v.daysInactive }}</span>
            <span class="days-unit">ngày</span>
          </div>
          <button
            type="button"
            class="contact-cta"
            :disabled="!v.zaloUid"
            :title="v.zaloUid ? 'Mở Zalo' : 'KH chưa có Zalo UID'"
            @click.stop="contactZalo(v)"
          >
            <v-icon size="14">mdi-message-text-outline</v-icon>
            <span class="cta-label">Liên hệ Zalo ngay</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Underperforming sales card -->
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  formatVNDShort,
  type CriticalAlertsResponse,
} from '@/composables/use-overview-report';

interface Props {
  data: CriticalAlertsResponse | null;
}
const props = defineProps<Props>();

const vipAtRisk = computed(() => props.data?.vipAtRisk ?? []);
const underperformingSales = computed(() => props.data?.underperformingSales ?? []);
const hasAnyAlert = computed(
  () => vipAtRisk.value.length > 0 || underperformingSales.value.length > 0,
);

const circumference = 2 * Math.PI * 16; // r=16 for our 40×40 ring

function ringColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

const router = useRouter();
function goContact(id: string) {
  router.push(`/contacts/${id}`);
}
function contactZalo(v: { contactId: string; zaloUid: string | null }) {
  if (!v.zaloUid) return;
  router.push(`/chat?contactId=${v.contactId}`);
}
</script>

<style scoped>
.alerts-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 900px) {
  .alerts-grid { grid-template-columns: 1fr 1fr; }
}

.alert-card {
  background: #1E293B;
  border-radius: 12px;
  padding: 12px;
  position: relative;
  overflow: hidden;
}
.alert-card--danger {
  border-left: 4px solid #EF4444;
  background: linear-gradient(180deg, rgba(127, 29, 29, 0.18) 0%, #1E293B 80%);
}
.alert-card--warn {
  border-left: 4px solid #F59E0B;
  background: linear-gradient(180deg, rgba(120, 53, 15, 0.18) 0%, #1E293B 80%);
}

.alert-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.alert-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #F8FAFC;
}
.count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  padding: 0 7px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.count-pill--danger { background: #EF4444; color: #fff; }
.count-pill--warn   { background: #F59E0B; color: #1E293B; }

.alert-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── VIP row ── */
.vip-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.45);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.vip-row:hover { background: rgba(15, 23, 42, 0.7); }
.vip-info { min-width: 0; }
.name {
  font-weight: 600;
  font-size: 0.85rem;
  color: #F8FAFC;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  font-size: 0.7rem;
  color: #94A3B8;
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.dot { opacity: 0.5; }
.lifetime-amt { color: #F59E0B; font-weight: 600; font-family: ui-monospace, monospace; }

.days-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #DC2626, #B91C1C);
  color: #FEF2F2;
  font-family: ui-monospace, monospace;
  line-height: 1;
  flex: 0 0 auto;
}
.days-num { font-size: 0.95rem; font-weight: 700; }
.days-unit { font-size: 0.5rem; opacity: 0.85; margin-top: 1px; letter-spacing: 0.05em; }

.contact-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 8px;
  background: #F97316;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.contact-cta:hover:not(:disabled) { background: #EA580C; }
.contact-cta:disabled { background: #475569; cursor: not-allowed; opacity: 0.65; }

/* On very narrow phones, hide CTA label and keep icon — VIP row stays inline */
@media (max-width: 460px) {
  .vip-row { grid-template-columns: 1fr auto auto; }
  .cta-label { display: none; }
  .contact-cta { padding: 7px 8px; }
}

/* ── Sale alert row ── */
.sale-alert-row {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.45);
  border-radius: 8px;
}
.score-ring { display: flex; align-items: center; justify-content: center; }
.sale-info { min-width: 0; }
</style>
