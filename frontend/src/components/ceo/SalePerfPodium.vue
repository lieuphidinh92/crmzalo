<template>
  <div v-if="rows.length >= 3" class="podium">
    <!-- Silver — left -->
    <div class="podium-spot podium-spot--silver">
      <div class="podium-medal">🥈</div>
      <v-avatar size="56" color="brand-navy-600" class="mb-2">
        <span class="text-h6">{{ initials(rows[1].saleName) }}</span>
      </v-avatar>
      <div class="podium-name">{{ rows[1].saleName }}</div>
      <div class="podium-score">{{ rows[1].overallScore.toFixed(0) }}</div>
      <div class="podium-revenue">DS: {{ formatVNDShort(rows[1].metrics.resaleRevenue) }}</div>
      <div class="podium-base podium-base--silver"></div>
    </div>

    <!-- Gold — center, biggest -->
    <div class="podium-spot podium-spot--gold">
      <div class="podium-medal">🥇</div>
      <v-avatar size="72" color="brand-amber-500" class="mb-2">
        <span class="text-h5">{{ initials(rows[0].saleName) }}</span>
      </v-avatar>
      <div class="podium-name">{{ rows[0].saleName }}</div>
      <div class="podium-score podium-score--gold">{{ rows[0].overallScore.toFixed(0) }}</div>
      <div class="podium-revenue">DS: {{ formatVNDShort(rows[0].metrics.resaleRevenue) }}</div>
      <div class="podium-base podium-base--gold"></div>
    </div>

    <!-- Bronze — right -->
    <div class="podium-spot podium-spot--bronze">
      <div class="podium-medal">🥉</div>
      <v-avatar size="56" color="brand-navy-600" class="mb-2">
        <span class="text-h6">{{ initials(rows[2].saleName) }}</span>
      </v-avatar>
      <div class="podium-name">{{ rows[2].saleName }}</div>
      <div class="podium-score">{{ rows[2].overallScore.toFixed(0) }}</div>
      <div class="podium-revenue">DS: {{ formatVNDShort(rows[2].metrics.resaleRevenue) }}</div>
      <div class="podium-base podium-base--bronze"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  formatVNDShort,
  type SaleMetrics,
} from '@/composables/use-sale-performance';

interface Props {
  rows: SaleMetrics[]; // already sorted by overallScore desc
}

defineProps<Props>();

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
</script>

<style scoped>
.podium {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr;
  align-items: end;
  gap: 16px;
  padding: 16px 24px;
}

.podium-spot {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
}

.podium-medal {
  font-size: 28px;
  margin-bottom: 4px;
}

.podium-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium-score {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-secondary);
}

.podium-score--gold {
  font-size: 36px;
  color: var(--brand-amber-500);
  text-shadow: 0 0 24px rgba(245, 158, 11, 0.4);
}

.podium-revenue {
  font-size: 12px;
  color: var(--text-muted);
}

.podium-base {
  width: 100%;
  margin-top: 12px;
  border-radius: 8px 8px 0 0;
}

.podium-base--gold {
  height: 80px;
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.5), rgba(245, 158, 11, 0.15));
}

.podium-base--silver {
  height: 56px;
  background: linear-gradient(180deg, rgba(184, 197, 214, 0.4), rgba(184, 197, 214, 0.1));
}

.podium-base--bronze {
  height: 40px;
  background: linear-gradient(180deg, rgba(217, 119, 6, 0.4), rgba(217, 119, 6, 0.1));
}
</style>
