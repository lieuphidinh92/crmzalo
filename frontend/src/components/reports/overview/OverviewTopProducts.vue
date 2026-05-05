<template>
  <v-card class="overview-card pa-3 h-100" variant="flat">
    <div class="d-flex align-start mb-3">
      <div>
        <div class="d-flex align-center">
          <v-icon icon="mdi-package-variant-closed" color="primary" class="mr-2" />
          <span class="text-h6">Top sản phẩm bán chạy</span>
        </div>
        <div class="text-caption text-medium-emphasis">5 SKU dẫn đầu trong kỳ</div>
      </div>
      <v-spacer />
      <!-- Detail page chưa build — disable Xem hết. Bật lại khi /reports/products có. -->
    </div>

    <div v-if="loading" class="loading-list">
      <div v-for="n in 5" :key="n" class="row-skeleton" />
    </div>

    <div v-else-if="!products.length" class="empty-state">
      <v-icon size="44" color="grey-darken-1">mdi-package-variant-remove</v-icon>
      <div class="mt-2">Chưa có đơn hàng trong kỳ này</div>
    </div>

    <ul v-else class="product-list">
      <li
        v-for="p in products"
        :key="p.sku"
        class="product-row"
        :title="'Click chi tiết SP đang phát triển'"
      >
        <div class="rank-cell">
          <span :class="['rank-badge', `rank-${p.rank <= 3 ? p.rank : 'rest'}`]">
            {{ p.rank }}
          </span>
        </div>
        <div class="info-cell">
          <div class="d-flex align-center gap-1">
            <v-chip
              size="x-small"
              variant="tonal"
              :color="brandColor(p.brand)"
              class="mr-1"
            >
              {{ p.brand }}
            </v-chip>
            <span class="text-caption text-medium-emphasis font-mono">{{ p.sku }}</span>
          </div>
          <div class="product-name" :title="p.productName">{{ p.productName }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ p.quantity }} {{ p.unit ?? 'đơn vị' }} đã bán
          </div>
        </div>
        <div class="number-cell">
          <div class="revenue">{{ formatVNDShort(p.revenue) }}</div>
          <div :class="['profit', p.profit >= 0 ? 'profit--pos' : 'profit--neg']">
            <v-icon size="11">{{ p.profit >= 0 ? 'mdi-arrow-up-bold' : 'mdi-arrow-down-bold' }}</v-icon>
            LN {{ formatVNDShort(p.profit) }}
          </div>
        </div>
      </li>
    </ul>
  </v-card>
</template>

<script setup lang="ts">
import {
  formatVNDShort,
  type TopProductRow,
} from '@/composables/use-overview-report';

interface Props {
  products: TopProductRow[];
  loading: boolean;
}
defineProps<Props>();

function brandColor(b: string): string {
  if (b === 'Manhae') return 'orange';
  if (b === 'Bioisland') return 'blue';
  if (b === 'Neubria') return 'purple';
  return 'grey';
}
</script>

<style scoped>
.overview-card {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.product-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.product-row {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05);
  cursor: not-allowed;
}
.product-row:last-child { border-bottom: none; }
.product-row:hover { background: rgba(148, 163, 184, 0.04); }

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.85rem;
  font-family: ui-monospace, monospace;
}
.rank-1 { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1e293b; }
.rank-2 { background: linear-gradient(135deg, #cbd5e1, #94a3b8); color: #1e293b; }
.rank-3 { background: linear-gradient(135deg, #d97706, #b45309); color: #fff; }
.rank-rest { background: rgba(148, 163, 184, 0.15); color: rgb(var(--v-theme-on-surface)); }

.info-cell {
  min-width: 0;
}
.product-name {
  font-weight: 500;
  font-size: 0.9rem;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  margin-top: 2px;
}
.number-cell {
  text-align: right;
  font-family: ui-monospace, monospace;
}
.revenue {
  font-weight: 700;
  font-size: 0.95rem;
  color: rgb(var(--v-theme-on-surface));
}
.profit {
  font-size: 0.75rem;
  margin-top: 2px;
}
.profit--pos { color: rgb(16, 185, 129); }
.profit--neg { color: rgb(239, 68, 68); }

.font-mono {
  font-family: ui-monospace, monospace;
}

.empty-state {
  text-align: center;
  padding: 32px 12px;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.6;
}

.loading-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
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
