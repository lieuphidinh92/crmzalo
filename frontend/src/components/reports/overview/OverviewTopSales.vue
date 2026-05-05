<template>
  <v-card class="overview-card pa-3 h-100" variant="flat">
    <div class="d-flex align-start mb-3">
      <div>
        <div class="d-flex align-center">
          <v-icon icon="mdi-trophy-outline" color="primary" class="mr-2" />
          <span class="text-h6">{{ hideRanking ? 'Doanh số của bạn' : 'Top NV Sale tháng' }}</span>
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ hideRanking ? 'Tóm tắt cá nhân trong kỳ' : 'Xếp theo doanh số đem về' }}
        </div>
      </div>
      <v-spacer />
      <v-btn
        v-if="!hideRanking"
        size="x-small"
        variant="text"
        append-icon="mdi-arrow-right"
        @click="goCeo"
      >
        Xem CEO
      </v-btn>
    </div>

    <div v-if="loading" class="loading-list">
      <div v-for="n in 5" :key="n" class="row-skeleton" />
    </div>

    <div v-else-if="visibleSales.length === 0" class="empty-state">
      <v-icon size="44" color="grey-darken-1">mdi-account-group-outline</v-icon>
      <div class="mt-2">Chưa có data sale trong kỳ</div>
    </div>

    <ul v-else class="sale-list">
      <li v-for="s in visibleSales" :key="s.saleId" class="sale-row">
        <div v-if="!hideRanking" class="rank-col">
          <span :class="['rank-badge', `rank-${s.rank <= 3 ? s.rank : 'rest'}`]">
            {{ s.rank }}
          </span>
        </div>
        <div
          class="avatar"
          :style="{ background: avatarColor(s.saleId) }"
          :title="s.saleName"
        >
          {{ initials(s.saleName) }}
        </div>
        <div class="info-col">
          <div class="name">{{ s.saleName }}</div>
          <div class="sub-meta">
            <span>Resale {{ formatVNDShort(s.resaleRevenue ?? s.monthRevenue) }}</span>
            <span class="dot">•</span>
            <span>Mới {{ formatVNDShort(s.newAgentRevenue ?? 0) }}</span>
          </div>
        </div>
        <div class="num-col">
          <div class="total">{{ formatVNDShort(s.totalRevenue ?? s.monthRevenue) }}</div>
          <div class="score-line">
            <v-chip
              size="x-small"
              :color="scoreColor(s.score)"
              variant="flat"
              class="score-chip"
            >
              {{ Math.round(s.score) }}
            </v-chip>
          </div>
        </div>
      </li>
    </ul>
  </v-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed } from 'vue';
import { formatVNDShort } from '@/composables/use-overview-report';

interface SaleRow {
  rank: number;
  saleId: string;
  saleName: string;
  score: number;
  monthRevenue: number;
  resaleRevenue?: number;
  newAgentRevenue?: number;
  totalRevenue?: number;
}

interface Props {
  sales: SaleRow[];
  loading: boolean;
  /** Per spec: members see only their own row, no ranking column. */
  hideRanking?: boolean;
  currentUserId?: string | null;
}
const props = withDefaults(defineProps<Props>(), {
  hideRanking: false,
  currentUserId: null,
});

const visibleSales = computed<SaleRow[]>(() => {
  const list = props.sales ?? [];
  if (!props.hideRanking) return list;
  if (!props.currentUserId) return list.slice(0, 1);
  const own = list.find((s) => s.saleId === props.currentUserId);
  return own ? [own] : [];
});
const router = useRouter();
function goCeo() {
  router.push('/dashboard/ceo');
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable color per saleId via simple string hash. */
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const palette = [
    '#ea580c', '#0284c7', '#7c3aed', '#059669',
    '#db2777', '#65a30d', '#dc2626', '#0891b2',
  ];
  return palette[h % palette.length];
}

function scoreColor(s: number): 'success' | 'warning' | 'error' | 'grey' {
  if (s >= 70) return 'success';
  if (s >= 50) return 'warning';
  if (s > 0) return 'error';
  return 'grey';
}
</script>

<style scoped>
.overview-card {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.sale-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sale-row {
  display: grid;
  grid-template-columns: 28px 32px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05);
  transition: background 0.12s;
}
.sale-row:last-child { border-bottom: none; }
.sale-row:hover { background: rgba(148, 163, 184, 0.04); }

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

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
}

.info-col {
  min-width: 0;
}
.name {
  font-weight: 600;
  font-size: 0.88rem;
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
  gap: 4px;
  font-family: ui-monospace, monospace;
}
.sub-meta .dot {
  opacity: 0.6;
}

.num-col {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.total {
  font-family: ui-monospace, monospace;
  font-weight: 700;
  font-size: 0.95rem;
  color: rgb(var(--v-theme-on-surface));
}
.score-chip {
  font-weight: 700;
  font-family: ui-monospace, monospace;
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
