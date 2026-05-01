<template>
  <div class="learning-view">
    <header class="header">
      <div>
        <h1 class="text-h5 font-weight-bold">📚 Học tập & Phát triển</h1>
        <p class="text-body-2 text-medium-emphasis ma-0">
          Mỗi tuần học ít nhất 1 module để giữ năng lực
        </p>
      </div>

      <div v-if="stats" class="stats">
        <div class="stat">
          <div class="text-caption text-medium-emphasis">Bắt buộc đã xong</div>
          <div class="text-h6 font-weight-bold">
            {{ stats.requiredCompleted }}/{{ stats.requiredTotal }}
          </div>
        </div>
        <div class="stat" style="min-width: 180px;">
          <div class="text-caption text-medium-emphasis">
            Tiến độ tháng ({{ stats.monthlyCompleted }}/{{ stats.monthlyTarget }})
          </div>
          <v-progress-linear
            :model-value="stats.monthlyPercent"
            :color="stats.monthlyPercent >= 100 ? 'success' : 'amber'"
            height="8"
            rounded
            class="mt-1"
          />
        </div>
      </div>
    </header>

    <v-tabs
      v-model="activeTab"
      color="amber"
      density="compact"
      class="mt-4"
    >
      <v-tab value="required">Bắt buộc</v-tab>
      <v-tab value="optional">Tự chọn</v-tab>
      <v-tab value="completed">Đã hoàn thành</v-tab>
    </v-tabs>

    <div v-if="loading" class="d-flex justify-center pa-12">
      <v-progress-circular indeterminate color="amber" />
    </div>

    <div
      v-else-if="modules.length === 0"
      class="empty-state pa-12 text-center"
    >
      <v-icon size="64" color="grey">mdi-book-open-page-variant-outline</v-icon>
      <p class="text-medium-emphasis mt-3">
        {{ activeTab === 'completed'
          ? 'Bạn chưa hoàn thành module nào'
          : activeTab === 'required'
            ? 'Không có module bắt buộc cho vai trò của bạn'
            : 'Không có module tự chọn nào' }}
      </p>
    </div>

    <v-row v-else class="mt-3">
      <v-col
        v-for="m in modules"
        :key="m.id"
        cols="12"
        sm="6"
        lg="4"
      >
        <LearningModuleCard :module="m" @open="openPlayer" />
      </v-col>
    </v-row>

    <LearningPlayerDialog
      v-model="playerOpen"
      :module="activeModule"
      @complete="onComplete"
    />

    <LearningRatingDialog v-model="ratingOpen" @submit="onRated" />

    <v-snackbar
      v-model="toastOpen"
      :timeout="3500"
      color="success"
      location="bottom right"
    >
      {{ toastMsg }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useLearning, type FilterTab, type LearningModule } from '@/composables/use-learning';
import LearningModuleCard from '@/components/learning/LearningModuleCard.vue';
import LearningPlayerDialog from '@/components/learning/LearningPlayerDialog.vue';
import LearningRatingDialog from '@/components/learning/LearningRatingDialog.vue';

const { modules, stats, loading, fetchModules, fetchStats, completeModule } = useLearning();

const activeTab = ref<FilterTab>('required');
const playerOpen = ref(false);
const ratingOpen = ref(false);
const activeModule = ref<LearningModule | null>(null);
const toastOpen = ref(false);
const toastMsg = ref('');

function openPlayer(m: LearningModule) {
  activeModule.value = m;
  playerOpen.value = true;
}

function onComplete() {
  // Player emits "complete" when user clicks the mark-done button.
  // Hand off to rating dialog (player stays open underneath).
  ratingOpen.value = true;
}

async function onRated(score: number | null) {
  if (!activeModule.value) return;
  try {
    await completeModule(activeModule.value.id, score);
    toastMsg.value = `Đã hoàn thành: ${activeModule.value.name}`;
    toastOpen.value = true;
    playerOpen.value = false;
    activeModule.value = null;
    await fetchModules(activeTab.value);
  } catch (err: any) {
    toastMsg.value = err?.response?.data?.error ?? 'Lỗi đánh dấu hoàn thành';
    toastOpen.value = true;
  }
}

watch(activeTab, (tab) => fetchModules(tab));

onMounted(async () => {
  await Promise.all([fetchModules('required'), fetchStats()]);
});
</script>

<style scoped>
.learning-view {
  padding: 8px 4px 32px;
}
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.stats {
  display: flex;
  gap: 24px;
  align-items: flex-end;
}
.stat {
  min-width: 110px;
}
.empty-state {
  background: var(--brand-navy-800, #0f1e36);
  border-radius: 12px;
  margin-top: 16px;
}
@media (max-width: 600px) {
  .header {
    flex-direction: column;
    align-items: stretch;
  }
  .stats {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
