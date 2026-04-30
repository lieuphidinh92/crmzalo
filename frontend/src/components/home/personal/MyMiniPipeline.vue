<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-pipe" color="primary" class="mr-2" />
      <div class="text-h6">Pipeline cá nhân</div>
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        append-icon="mdi-arrow-right"
        @click="$emit('open-pipeline')"
      >
        Mở Pipeline đầy đủ
      </v-btn>
    </div>

    <div class="mini-pipeline">
      <div
        v-for="(col, idx) in columns"
        :key="col.stage"
        :class="['mini-pipeline__col', `is-${col.stage}`]"
        @click="$emit('open-pipeline', col.stage)"
      >
        <div class="mini-pipeline__label">{{ col.label }}</div>
        <div class="mini-pipeline__count">{{ col.count }}</div>
        <div class="mini-pipeline__value">{{ formatVNDShort(col.totalValue) }}</div>
        <v-icon
          v-if="idx < columns.length - 1"
          class="mini-pipeline__arrow"
          size="14"
          color="grey-darken-1"
        >mdi-chevron-right</v-icon>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {
  formatVNDShort,
  type MiniPipelineColumn,
} from '@/composables/use-personal-dashboard';

interface Props {
  columns: MiniPipelineColumn[];
}
defineProps<Props>();
defineEmits<{
  (e: 'open-pipeline', stage?: string): void;
}>();
</script>

<style scoped>
.mini-pipeline {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.mini-pipeline__col {
  position: relative;
  padding: 12px 10px;
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.12s;
  text-align: center;
}

.mini-pipeline__col:hover {
  border-color: var(--brand-amber-500);
  transform: translateY(-2px);
}

.mini-pipeline__col.is-tiep_can { border-top: 2px solid #7A8AA0; }
.mini-pipeline__col.is-da_bao_gia { border-top: 2px solid #3B82F6; }
.mini-pipeline__col.is-dang_thu_hang { border-top: 2px solid #F59E0B; }
.mini-pipeline__col.is-dai_ly_chinh_thuc { border-top: 2px solid #10B981; }
.mini-pipeline__col.is-ngung { border-top: 2px solid #EF4444; }

.mini-pipeline__label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  margin-bottom: 4px;
}

.mini-pipeline__count {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.mini-pipeline__value {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.mini-pipeline__arrow {
  position: absolute;
  top: 50%;
  right: -10px;
  transform: translateY(-50%);
  z-index: 1;
  background: var(--brand-navy-800);
  border-radius: 50%;
  padding: 1px;
}

@media (max-width: 768px) {
  .mini-pipeline {
    grid-template-columns: repeat(2, 1fr);
  }
  .mini-pipeline__arrow { display: none; }
}
</style>
