<template>
  <v-card class="nds-learning-card" :class="{ done: module.progressStatus === 'completed' }">
    <div class="thumb">
      <img v-if="thumbnail" :src="thumbnail" :alt="module.name" loading="lazy" />
      <div v-else class="thumb-fallback">
        <v-icon size="48" color="grey-lighten-1">mdi-school-outline</v-icon>
      </div>
      <span class="badge" :class="module.type">
        {{ module.type === 'required' ? 'Bắt buộc' : 'Tự chọn' }}
      </span>
    </div>

    <v-card-text class="pa-3">
      <div class="title-row">
        <h3 class="text-subtitle-1 font-weight-bold">{{ module.name }}</h3>
        <v-icon
          v-if="module.progressStatus === 'completed'"
          color="success"
          size="20"
        >
          mdi-check-circle
        </v-icon>
      </div>

      <p v-if="module.description" class="desc text-caption text-medium-emphasis">
        {{ module.description }}
      </p>

      <div class="meta text-caption text-medium-emphasis mt-2">
        <span v-if="module.durationMinutes">
          <v-icon size="14">mdi-clock-outline</v-icon>
          {{ module.durationMinutes }} phút
        </span>
        <span>
          <v-icon size="14">mdi-account-multiple-outline</v-icon>
          {{ module.learnerCount }} người đã học
        </span>
        <span v-if="module.progressScore !== null">
          <v-icon size="14" color="amber">mdi-star</v-icon>
          {{ module.progressScore }}/5
        </span>
      </div>

      <v-progress-linear
        v-if="module.progressStatus === 'in_progress'"
        :model-value="50"
        color="amber"
        height="4"
        rounded
        class="mt-3"
      />
    </v-card-text>

    <v-card-actions class="px-3 pb-3 pt-0">
      <v-btn
        v-if="module.progressStatus === 'not_started'"
        color="primary"
        variant="flat"
        block
        @click="$emit('open', module)"
      >
        🎬 Bắt đầu học
      </v-btn>
      <v-btn
        v-else-if="module.progressStatus === 'in_progress'"
        color="amber"
        variant="flat"
        block
        @click="$emit('open', module)"
      >
        ▶️ Tiếp tục
      </v-btn>
      <v-btn
        v-else
        color="success"
        variant="tonal"
        block
        @click="$emit('open', module)"
      >
        Xem lại
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LearningModule } from '@/composables/use-learning';

const props = defineProps<{ module: LearningModule }>();
defineEmits<{ (e: 'open', m: LearningModule): void }>();

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  return match ? match[1] : null;
}

const thumbnail = computed(() => {
  if (!props.module.contentUrl) return null;
  const id = extractYouTubeId(props.module.contentUrl);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
});
</script>

<style scoped>
.nds-learning-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--brand-navy-800, #0f1e36);
  transition: transform 0.2s, border-color 0.2s;
}
.nds-learning-card:hover {
  transform: translateY(-2px);
  border-color: var(--brand-amber-500, #f59e0b);
}
.nds-learning-card.done {
  border-color: rgba(16, 185, 129, 0.4);
}
.thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--brand-navy-700, #162844);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.badge.required {
  background: rgba(239, 68, 68, 0.85);
  color: white;
}
.badge.optional {
  background: rgba(34, 197, 94, 0.85);
  color: white;
}
.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.title-row h3 {
  line-height: 1.3;
}
.desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
