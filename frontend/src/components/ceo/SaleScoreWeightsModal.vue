<template>
  <v-dialog v-model="open" max-width="640" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-tune-variant" class="mr-2" />
        Tuỳ chỉnh trọng số đánh giá
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="open = false" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <v-alert
          v-if="!canEdit"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          Bạn đang xem ở chế độ chỉ đọc. Chỉ Owner / Admin mới sửa được trọng số.
        </v-alert>

        <p class="text-body-2 text-medium-emphasis mb-4">
          Tổng phải bằng <strong>100%</strong>. Slider tự động hiện preview
          score sẽ tính lại như thế nào.
        </p>

        <div class="weight-row" v-for="row in working" :key="row.metricKey">
          <div class="d-flex align-center">
            <span class="weight-row__label flex-grow-1">{{ row.label }}</span>
            <span class="weight-row__value">{{ row.weight.toFixed(0) }}%</span>
          </div>
          <v-slider
            v-model="row.weight"
            :max="50"
            :min="0"
            step="1"
            color="primary"
            track-color="brand-navy-600"
            hide-details
            :disabled="!canEdit"
          />
        </div>

        <v-alert
          v-if="!isValid"
          type="error"
          density="compact"
          variant="tonal"
          class="mt-3"
        >
          Tổng đang là <strong>{{ totalWeight.toFixed(0) }}%</strong> — phải = 100%.
        </v-alert>
        <v-alert
          v-else
          type="success"
          density="compact"
          variant="tonal"
          class="mt-3"
        >
          Tổng = 100% — sẵn sàng lưu.
        </v-alert>

        <!-- Preview re-rank -->
        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">Preview xếp hạng</div>
        <div v-if="previewRows.length === 0" class="text-caption text-medium-emphasis">
          Chưa có sale nào trong dataset.
        </div>
        <div v-else class="preview-list">
          <div
            v-for="(p, i) in previewRows"
            :key="p.saleId"
            class="preview-row"
          >
            <span class="preview-row__rank">#{{ i + 1 }}</span>
            <span class="preview-row__name">{{ p.saleName }}</span>
            <v-spacer />
            <span class="preview-row__score">{{ p.previewScore.toFixed(0) }}</span>
            <v-icon
              size="14"
              :color="p.delta > 0 ? 'success' : p.delta < 0 ? 'error' : 'grey'"
            >
              {{ p.delta > 0 ? 'mdi-arrow-up' : p.delta < 0 ? 'mdi-arrow-down' : 'mdi-equal' }}
            </v-icon>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-3">
        <v-btn
          variant="text"
          :disabled="!canEdit || saving"
          @click="onReset"
        >
          Reset về mặc định
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Huỷ</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!canEdit || !isValid"
          prepend-icon="mdi-content-save"
          @click="onSave"
        >
          Lưu
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  type MetricKey,
  type SaleMetrics,
} from '@/composables/use-sale-performance';
import type { ScoreWeight } from '@/composables/use-sale-score-config';

interface Props {
  modelValue: boolean;
  weights: ScoreWeight[];
  rows: SaleMetrics[];
  canEdit: boolean;
  saving: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'save', updates: Array<{ metricKey: MetricKey; weight: number }>): Promise<void> | void;
  (e: 'reset'): Promise<void> | void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const working = ref<ScoreWeight[]>([]);

watch(
  () => [props.modelValue, props.weights],
  () => {
    if (props.modelValue) {
      working.value = props.weights.map((w) => ({ ...w }));
    }
  },
  { immediate: true, deep: true },
);

const totalWeight = computed(() =>
  working.value.reduce((s, w) => s + w.weight, 0),
);
const isValid = computed(() => Math.abs(totalWeight.value - 100) <= 0.5);

interface PreviewRow {
  saleId: string;
  saleName: string;
  previewScore: number;
  originalRank: number;
  delta: number; // negative = moved down (worse), positive = moved up
}

const previewRows = computed<PreviewRow[]>(() => {
  if (props.rows.length === 0) return [];
  const wMap = working.value.reduce((acc, w) => {
    acc[w.metricKey] = w.weight;
    return acc;
  }, {} as Record<MetricKey, number>);

  // Original ranks (sorted by overallScore desc as displayed).
  const sortedOrig = [...props.rows].sort((a, b) => b.overallScore - a.overallScore);
  const origRank = new Map<string, number>(
    sortedOrig.map((r, i) => [r.saleId, i]),
  );

  const preview = props.rows.map((r) => {
    let s = 0;
    for (const k of Object.keys(wMap) as MetricKey[]) {
      s += (r.normalized[k] * wMap[k]) / 100;
    }
    return { saleId: r.saleId, saleName: r.saleName, previewScore: s };
  });
  preview.sort((a, b) => b.previewScore - a.previewScore);
  return preview.map((p, i) => ({
    ...p,
    originalRank: origRank.get(p.saleId) ?? i,
    delta: (origRank.get(p.saleId) ?? i) - i,
  }));
});

async function onSave() {
  await emit(
    'save',
    working.value.map((w) => ({ metricKey: w.metricKey, weight: w.weight })),
  );
  open.value = false;
}

async function onReset() {
  await emit('reset');
}
</script>

<style scoped>
.weight-row {
  margin-bottom: 8px;
}

.weight-row__label {
  font-weight: 600;
  font-size: 13px;
}

.weight-row__value {
  font-weight: 700;
  color: var(--brand-amber-500);
}

.preview-list { display: flex; flex-direction: column; gap: 4px; }

.preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--brand-navy-700);
  border-radius: 6px;
  font-size: 12px;
}

.preview-row__rank {
  color: var(--text-secondary);
  width: 24px;
  font-weight: 600;
}

.preview-row__score {
  font-weight: 700;
  color: var(--text-primary);
  width: 36px;
  text-align: right;
}
</style>
