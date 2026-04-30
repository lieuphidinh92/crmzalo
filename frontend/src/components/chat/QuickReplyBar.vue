<template>
  <div class="quick-reply-bar">
    <div class="quick-reply-bar__scroll">
      <button
        v-for="t in templates"
        :key="t.key"
        type="button"
        class="quick-reply-chip"
        :class="{
          'is-empty': !hasContent(t),
          'is-loading': sending === t.key,
        }"
        :disabled="disabled || sending !== null || !hasContent(t)"
        :title="
          hasContent(t)
            ? `Gửi: ${t.label}`
            : `${t.label} chưa được cấu hình`
        "
        @click="onClick(t)"
      >
        <v-progress-circular
          v-if="sending === t.key"
          indeterminate
          size="14"
          width="2"
          class="mr-1"
        />
        <v-icon v-else :icon="t.icon" size="16" class="mr-1" />
        <span>{{ t.label }}</span>
      </button>
    </div>
    <v-snackbar
      v-model="snack.show"
      :color="snack.color"
      timeout="3500"
      location="bottom right"
    >
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  useQuickReplies,
  type QuickReplyKey,
  type QuickReplyTemplate,
} from '@/composables/use-quick-replies';

interface Props {
  conversationId: string | null;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const { templates, fetchTemplates, sending, sendQuickReply } = useQuickReplies();

const snack = ref({ show: false, text: '', color: 'success' as string });

onMounted(() => {
  // Fire-and-forget; cached at module level so this is cheap.
  fetchTemplates().catch(() => {
    /* error already exposed via composable */
  });
});

function hasContent(t: QuickReplyTemplate): boolean {
  return Boolean((t.content || '').trim() || (t.mediaUrl || '').trim());
}

async function onClick(t: QuickReplyTemplate) {
  if (!props.conversationId) {
    snack.value = {
      show: true,
      text: 'Chọn cuộc trò chuyện trước khi gửi',
      color: 'warning',
    };
    return;
  }
  if (!hasContent(t)) {
    snack.value = {
      show: true,
      text: `"${t.label}" chưa được cấu hình. Vào Cấu hình → Trả lời nhanh để điền nội dung.`,
      color: 'warning',
    };
    return;
  }

  try {
    await sendQuickReply(props.conversationId, t.key as QuickReplyKey);
    snack.value = {
      show: true,
      text: `Đã gửi: ${t.label}`,
      color: 'success',
    };
  } catch (err: any) {
    snack.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Gửi thất bại',
      color: 'error',
    };
  }
}
</script>

<style scoped>
.quick-reply-bar {
  border-top: 1px solid var(--brand-navy-600);
  background: var(--brand-navy-800);
}

.quick-reply-bar__scroll {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.quick-reply-bar__scroll::-webkit-scrollbar {
  height: 4px;
}

.quick-reply-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--brand-navy-500);
  background: var(--brand-navy-700);
  color: var(--text-secondary);
  font-family: 'Inter', 'Plus Jakarta Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.1px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 0.15s var(--liquid-ease),
    border-color 0.15s var(--liquid-ease),
    background 0.15s var(--liquid-ease),
    transform 0.15s var(--liquid-ease);
}

.quick-reply-chip:hover:not(:disabled) {
  color: var(--brand-amber-500);
  border-color: var(--brand-amber-500);
  background: rgba(245, 158, 11, 0.08);
  transform: translateY(-1px);
}

.quick-reply-chip:active:not(:disabled) {
  transform: translateY(0);
}

.quick-reply-chip:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.quick-reply-chip.is-empty {
  border-style: dashed;
  color: var(--text-muted);
}

.quick-reply-chip.is-loading {
  color: var(--brand-amber-500);
  border-color: var(--brand-amber-500);
  background: rgba(245, 158, 11, 0.12);
}
</style>
