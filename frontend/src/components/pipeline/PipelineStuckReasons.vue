<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-comment-question-outline" color="error" class="mr-2" />
      <div class="text-h6">Top lý do ngừng</div>
      <v-spacer />
      <span class="text-caption text-medium-emphasis">
        Pattern để leader cải thiện
      </span>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <div v-if="!loading && reasons.length === 0" class="text-center pa-6 text-medium-emphasis">
      <v-icon size="48" color="grey-darken-1">mdi-emoticon-cool-outline</v-icon>
      <div class="mt-2">Chưa có deal nào bị ngừng — tin tốt!</div>
    </div>

    <div v-else>
      <div
        v-for="(row, idx) in reasons"
        :key="idx"
        class="reason-row"
      >
        <div class="d-flex align-center">
          <span class="reason-row__rank">{{ idx + 1 }}</span>
          <div class="reason-row__text flex-grow-1 ml-2">{{ row.reason }}</div>
          <v-chip size="small" variant="tonal" color="error">
            {{ row.count }} deal
          </v-chip>
        </div>
        <div class="reason-row__bar mt-2">
          <div
            class="reason-row__bar-fill"
            :style="{ width: `${(row.count / maxCount) * 100}%` }"
          />
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  reasons: Array<{ reason: string; count: number }>;
  loading: boolean;
}

const props = defineProps<Props>();

const maxCount = computed(() =>
  props.reasons.length === 0
    ? 1
    : Math.max(...props.reasons.map((r) => r.count)),
);
</script>

<style scoped>
.reason-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--brand-navy-600);
}

.reason-row:last-child {
  border-bottom: none;
}

.reason-row__rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--brand-navy-600);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.reason-row__text {
  font-size: 13px;
  font-weight: 500;
}

.reason-row__bar {
  height: 4px;
  background: var(--brand-navy-700);
  border-radius: 2px;
  overflow: hidden;
}

.reason-row__bar-fill {
  height: 100%;
  background: linear-gradient(
    90deg,
    rgba(239, 68, 68, 0.4),
    rgba(239, 68, 68, 0.9)
  );
  border-radius: 2px;
  transition: width 0.3s var(--liquid-ease);
}
</style>
