<template>
  <div class="quick-replies-view">
    <h1 class="text-h5 mb-4 d-flex align-center">
      <v-icon icon="mdi-message-flash-outline" class="mr-2" color="primary" />
      Cấu hình Trả lời nhanh
    </h1>

    <p class="text-body-2 text-medium-emphasis mb-4">
      Năm mẫu cố định hiển thị phía trên ô nhập tin nhắn của nhân viên. Tên
      nút không sửa được; chỉ chỉnh nội dung và loại nội dung. Cấu hình áp
      dụng cho toàn tổ chức.
    </p>

    <!-- Permission gate visual — backend cũng đã chặn -->
    <v-alert
      v-if="!canEdit"
      type="info"
      variant="tonal"
      class="mb-4"
      density="comfortable"
    >
      Bạn đang xem ở chế độ chỉ đọc. Chỉ Owner / Admin mới có thể chỉnh sửa.
    </v-alert>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <div v-if="error" class="text-error mb-3">{{ error }}</div>

    <v-row>
      <v-col
        v-for="t in editable"
        :key="t.key"
        cols="12"
        md="6"
      >
        <v-card class="pa-4 h-100">
          <div class="d-flex align-center mb-3">
            <v-icon :icon="t.icon" color="primary" class="mr-2" />
            <div class="text-h6">{{ t.label }}</div>
            <v-spacer />
            <v-chip
              size="x-small"
              :color="hasContent(t) ? 'success' : 'warning'"
              variant="tonal"
            >
              {{ hasContent(t) ? 'Đã cấu hình' : 'Trống' }}
            </v-chip>
          </div>

          <v-select
            v-model="t.type"
            :items="typeOptions"
            label="Loại nội dung"
            density="comfortable"
            class="mb-2"
            :disabled="!canEdit"
          />

          <v-textarea
            v-if="needsContent(t.type)"
            v-model="t.content"
            label="Nội dung text"
            rows="4"
            auto-grow
            density="comfortable"
            class="mb-2"
            :disabled="!canEdit"
            :placeholder="contentPlaceholder(t.type)"
          />

          <v-text-field
            v-if="needsMedia(t.type)"
            v-model="t.mediaUrl"
            :label="t.type === 'link' ? 'URL liên kết' : 'URL hình ảnh'"
            prepend-inner-icon="mdi-link-variant"
            density="comfortable"
            class="mb-2"
            placeholder="https://..."
            :disabled="!canEdit"
          />

          <!-- Preview -->
          <div class="preview-box mb-2">
            <div class="text-caption text-medium-emphasis mb-1">Xem trước:</div>
            <div v-if="!hasContent(t)" class="text-body-2 text-disabled">
              <em>Chưa có nội dung</em>
            </div>
            <template v-else>
              <div
                v-if="t.content"
                class="text-body-2 mb-1"
                style="white-space: pre-wrap;"
              >{{ t.content }}</div>
              <div
                v-if="t.mediaUrl && t.type !== 'image' && t.type !== 'combined'"
                class="text-body-2"
                style="word-break: break-all;"
              >
                <v-icon size="14" class="mr-1">mdi-link</v-icon>
                <span style="color: var(--brand-amber-500);">{{ t.mediaUrl }}</span>
              </div>
              <img
                v-if="t.mediaUrl && (t.type === 'image' || t.type === 'combined')"
                :src="t.mediaUrl"
                alt="preview"
                class="preview-image"
              />
            </template>
          </div>

          <div class="d-flex">
            <v-spacer />
            <v-btn
              color="primary"
              prepend-icon="mdi-content-save-outline"
              :loading="savingKey === t.key"
              :disabled="!canEdit || !isDirty(t)"
              @click="save(t)"
            >
              Lưu
            </v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  useQuickReplies,
  type QuickReplyKey,
  type QuickReplyTemplate,
  type QuickReplyType,
} from '@/composables/use-quick-replies';

interface EditableTemplate {
  key: QuickReplyKey;
  label: string;
  icon: string;
  type: QuickReplyType;
  content: string;
  mediaUrl: string;
  // Snapshot of last-saved state for dirty checking
  _saved: { type: QuickReplyType; content: string; mediaUrl: string };
}

const router = useRouter();
const authStore = useAuthStore();
const {
  templates,
  loading,
  error,
  fetchTemplates,
  updateTemplate,
} = useQuickReplies();

const canEdit = computed(() =>
  ['owner', 'admin'].includes(authStore.user?.role ?? ''),
);

const typeOptions = [
  { title: 'Text — chỉ chữ', value: 'text' },
  { title: 'Link — chữ + URL', value: 'link' },
  { title: 'Hình ảnh', value: 'image' },
  { title: 'Kết hợp — chữ + hình', value: 'combined' },
];

const editable = reactive<EditableTemplate[]>([]);
const savingKey = ref<QuickReplyKey | null>(null);
const snack = ref({ show: false, text: '', color: 'success' as string });

function makeEditable(t: QuickReplyTemplate): EditableTemplate {
  const saved = {
    type: t.type,
    content: t.content || '',
    mediaUrl: t.mediaUrl || '',
  };
  return {
    key: t.key,
    label: t.label,
    icon: t.icon,
    type: saved.type,
    content: saved.content,
    mediaUrl: saved.mediaUrl,
    _saved: { ...saved },
  };
}

function hydrate() {
  editable.splice(
    0,
    editable.length,
    ...templates.value.map((t) => makeEditable(t as QuickReplyTemplate)),
  );
}

watch(templates, hydrate);

onMounted(async () => {
  // Members visiting directly — soft redirect since BE will 403 on PUT anyway.
  if (!canEdit.value) {
    // Allow read-only view; do not redirect.
  }
  try {
    await fetchTemplates(true);
    hydrate();
  } catch {
    /* error exposed via composable */
  }
});

function needsContent(type: QuickReplyType): boolean {
  return type === 'text' || type === 'link' || type === 'combined';
}

function needsMedia(type: QuickReplyType): boolean {
  return type === 'link' || type === 'image' || type === 'combined';
}

function contentPlaceholder(type: QuickReplyType): string {
  if (type === 'text') return 'Nhập nội dung tin nhắn...';
  if (type === 'link') return 'Nội dung kèm theo liên kết (tuỳ chọn)...';
  if (type === 'combined') return 'Mô tả ngắn về hình ảnh...';
  return '';
}

function hasContent(t: EditableTemplate): boolean {
  return Boolean(t.content.trim() || t.mediaUrl.trim());
}

function isDirty(t: EditableTemplate): boolean {
  return (
    t.type !== t._saved.type ||
    t.content !== t._saved.content ||
    t.mediaUrl !== t._saved.mediaUrl
  );
}

async function save(t: EditableTemplate) {
  savingKey.value = t.key;
  try {
    await updateTemplate(t.key, {
      type: t.type,
      content: t.content,
      mediaUrl: t.mediaUrl || null,
    });
    t._saved = { type: t.type, content: t.content, mediaUrl: t.mediaUrl };
    snack.value = {
      show: true,
      text: `Đã lưu: ${t.label}`,
      color: 'success',
    };
  } catch (err: any) {
    snack.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Lưu thất bại',
      color: 'error',
    };
  } finally {
    savingKey.value = null;
  }
}

// Suppress unused-router warning
void router;
</script>

<style scoped>
.quick-replies-view {
  max-width: 1200px;
  margin: 0 auto;
}

.preview-box {
  padding: 12px;
  border-radius: 12px;
  background: var(--brand-navy-800);
  border: 1px dashed var(--brand-navy-500);
  min-height: 60px;
}

.preview-image {
  max-width: 100%;
  max-height: 240px;
  border-radius: 8px;
  margin-top: 4px;
}
</style>
