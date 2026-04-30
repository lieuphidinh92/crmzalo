<template>
  <v-row dense>
    <!-- Recent new agents -->
    <v-col cols="12" md="6">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-3">
          <span style="font-size: 20px;">🆕</span>
          <div class="text-h6 ml-2">Đại lý mới tuần này</div>
          <v-spacer />
          <v-chip size="x-small" variant="tonal" color="success">
            {{ recent.length }}
          </v-chip>
        </div>
        <div v-if="!recent.length" class="text-center pa-6 text-medium-emphasis">
          <v-icon size="40" color="grey-darken-1">mdi-account-plus-outline</v-icon>
          <div class="mt-2 text-body-2">Chưa có đại lý mới chốt</div>
        </div>
        <div v-else class="recent-list">
          <div
            v-for="a in recent"
            :key="a.contactId"
            class="recent-row"
            @click="$emit('open-contact', a.contactId)"
          >
            <div class="recent-row__main">
              <div class="d-flex align-center">
                <span class="font-weight-medium text-truncate">{{ a.fullName ?? '(không tên)' }}</span>
                <v-chip
                  v-if="a.customerType"
                  size="x-small"
                  variant="tonal"
                  color="info"
                  class="ml-2"
                >
                  {{ customerTypeLabel(a.customerType) }}
                </v-chip>
              </div>
              <div class="text-caption text-medium-emphasis">
                Sale: {{ a.assignedUser?.fullName ?? '—' }} · {{ formatRelative(a.closedAt) }}
              </div>
            </div>
          </div>
          <v-btn
            block
            variant="text"
            size="small"
            append-icon="mdi-arrow-right"
            class="mt-2"
            @click="$emit('open-contacts')"
          >
            Xem tất cả
          </v-btn>
        </div>
      </v-card>
    </v-col>

    <!-- Top sales -->
    <v-col cols="12" md="6">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-3">
          <span style="font-size: 20px;">🏆</span>
          <div class="text-h6 ml-2">Top 5 Sale tháng</div>
          <v-spacer />
          <v-btn
            variant="text"
            size="x-small"
            append-icon="mdi-arrow-right"
            @click="$emit('open-ceo')"
          >
            Xem CEO
          </v-btn>
        </div>
        <div v-if="!topSales.length" class="text-center pa-6 text-medium-emphasis">
          <v-icon size="40" color="grey-darken-1">mdi-medal-outline</v-icon>
          <div class="mt-2 text-body-2">Chưa có data sale</div>
        </div>
        <v-table v-else density="compact" class="bg-transparent">
          <thead>
            <tr>
              <th>#</th>
              <th>Sale</th>
              <th class="text-right">DS tháng</th>
              <th class="text-center">Score</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in topSales" :key="s.saleId">
              <td>
                <v-icon
                  v-if="s.rank <= 3"
                  :color="['warning', 'grey', 'orange'][s.rank - 1]"
                  size="16"
                >mdi-medal</v-icon>
                <span v-else class="text-medium-emphasis">{{ s.rank }}</span>
              </td>
              <td class="font-weight-medium">{{ s.saleName }}</td>
              <td class="text-right">{{ formatVNDShort(s.monthRevenue) }}</td>
              <td class="text-center">
                <v-chip
                  size="x-small"
                  :color="scoreColor(s.score)"
                  variant="flat"
                  class="font-weight-bold"
                >
                  {{ Math.round(s.score) }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  customerTypeLabel,
  formatVNDShort,
  type RecentNewAgent,
  type TopSale,
} from '@/composables/use-admin-dashboard';

interface Props {
  recent: RecentNewAgent[];
  topSales: TopSale[];
}
defineProps<Props>();
defineEmits<{
  (e: 'open-contact', id: string): void;
  (e: 'open-contacts'): void;
  (e: 'open-ceo'): void;
}>();

function formatRelative(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );
  if (days === 0) return 'hôm nay';
  if (days === 1) return 'hôm qua';
  if (days < 7) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

function scoreColor(s: number): string {
  if (s >= 80) return 'success';
  if (s >= 60) return 'warning';
  return 'error';
}
</script>

<style scoped>
.recent-list { display: flex; flex-direction: column; gap: 6px; }

.recent-row {
  padding: 8px 12px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.12s;
}

.recent-row:hover {
  border-color: var(--brand-amber-500);
  transform: translateX(2px);
}

.recent-row__main { min-width: 0; }
</style>
