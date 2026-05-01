<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
    fullscreen
    transition="dialog-bottom-transition"
  >
    <v-card v-if="module" class="player-card">
      <v-toolbar color="surface" density="compact">
        <v-btn icon @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title class="text-truncate">{{ module.name }}</v-toolbar-title>
      </v-toolbar>

      <div class="video-shell">
        <div v-if="youTubeId" class="iframe-wrap">
          <div ref="ytContainer"></div>
        </div>
        <iframe
          v-else-if="module.contentUrl"
          :src="module.contentUrl"
          frameborder="0"
          allowfullscreen
          allow="autoplay"
          class="generic-iframe"
        />
        <div v-else class="empty">
          <v-icon size="64" color="grey">mdi-video-off-outline</v-icon>
          <p class="text-medium-emphasis mt-2">Module chưa có video</p>
        </div>
      </div>

      <v-card-text class="footer">
        <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 12px;">
          <div>
            <div class="text-caption text-medium-emphasis">Tiến độ xem</div>
            <v-progress-linear
              :model-value="progressPercent"
              :color="canComplete ? 'success' : 'amber'"
              height="8"
              rounded
              style="min-width: 240px;"
            />
            <div class="text-caption mt-1">
              {{ progressPercent.toFixed(0) }}%
              <span v-if="youTubeId && !canComplete" class="text-medium-emphasis">
                — xem ≥80% để mở khoá
              </span>
            </div>
          </div>
          <v-btn
            color="success"
            size="large"
            :disabled="!canComplete"
            prepend-icon="mdi-check"
            @click="$emit('complete')"
          >
            Đánh dấu hoàn thành
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { LearningModule } from '@/composables/use-learning';
import { useLearning } from '@/composables/use-learning';

const props = defineProps<{
  modelValue: boolean;
  module: LearningModule | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'complete'): void;
}>();

const { trackProgress } = useLearning();

const ytContainer = ref<HTMLElement | null>(null);
const player = ref<any>(null);
const progressPercent = ref(0);
let pollHandle: ReturnType<typeof setInterval> | null = null;
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  return match ? match[1] : null;
}

const youTubeId = computed(() => {
  if (!props.module?.contentUrl) return null;
  return extractYouTubeId(props.module.contentUrl);
});

// Non-YouTube videos can be marked done at any time. YouTube needs ≥80%.
const canComplete = computed(() => {
  if (!youTubeId.value) return true;
  return progressPercent.value >= 80;
});

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve();
    const w = window as any;
    if (w.YT && w.YT.Player) return resolve();
    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    w.onYouTubeIframeAPIReady = () => resolve();
    // In case API was loading and ready event already fired
    const tick = setInterval(() => {
      if (w.YT && w.YT.Player) {
        clearInterval(tick);
        resolve();
      }
    }, 100);
  });
}

async function initYouTube() {
  if (!youTubeId.value || !ytContainer.value) return;
  await loadYouTubeApi();
  const w = window as any;
  player.value = new w.YT.Player(ytContainer.value, {
    videoId: youTubeId.value,
    width: '100%',
    height: '100%',
    playerVars: { rel: 0, modestbranding: 1 },
    events: {
      onStateChange: (e: any) => {
        // YT.PlayerState.PLAYING = 1
        if (e.data === 1) startPolling();
        else stopPolling();
      },
    },
  });
}

function startPolling() {
  stopPolling();
  pollHandle = setInterval(() => {
    if (!player.value?.getCurrentTime || !player.value?.getDuration) return;
    const cur = player.value.getCurrentTime();
    const dur = player.value.getDuration();
    if (dur > 0) {
      progressPercent.value = Math.min(100, (cur / dur) * 100);
    }
  }, 1000);
  if (!heartbeatHandle && props.module) {
    const moduleId = props.module.id;
    heartbeatHandle = setInterval(() => {
      trackProgress(moduleId);
    }, 10_000);
    // immediate first heartbeat
    trackProgress(moduleId);
  }
}

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

function teardown() {
  stopPolling();
  if (heartbeatHandle) {
    clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
  if (player.value?.destroy) {
    try {
      player.value.destroy();
    } catch {
      // best-effort cleanup
    }
    player.value = null;
  }
  progressPercent.value = 0;
}

function close() {
  teardown();
  emit('update:modelValue', false);
}

watch(
  () => [props.modelValue, props.module?.id],
  async ([open]) => {
    if (open) {
      await nextTick();
      // Reset state on each open
      progressPercent.value = 0;
      if (player.value) teardown();
      await initYouTube();
    } else {
      teardown();
    }
  },
);

onBeforeUnmount(teardown);
</script>

<style scoped>
.player-card {
  display: flex;
  flex-direction: column;
  background: var(--brand-navy-900, #0a1628);
}
.video-shell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: black;
  overflow: hidden;
  min-height: 50vh;
}
.iframe-wrap {
  width: 100%;
  max-width: 1280px;
  aspect-ratio: 16 / 9;
}
.iframe-wrap > div {
  width: 100%;
  height: 100%;
}
.generic-iframe {
  width: 100%;
  max-width: 1280px;
  aspect-ratio: 16 / 9;
}
.empty {
  text-align: center;
  color: var(--text-muted);
}
.footer {
  background: var(--brand-navy-800, #0f1e36);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
