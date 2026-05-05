<template>
  <div>
    <v-list density="compact" class="docs-list" v-if="docs.length > 0">
      <v-list-item
        v-for="d in docs"
        :key="d.id"
        :href="d.driveUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="doc-item"
      >
        <template #prepend>
          <v-icon :icon="iconFor(d.type)" color="primary" />
        </template>

        <v-list-item-title class="text-body-2">
          {{ d.name }}
        </v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          <v-icon size="12" class="mr-1">mdi-open-in-new</v-icon>
          {{ truncateUrl(d.driveUrl) }}
        </v-list-item-subtitle>

        <template #append>
          <v-btn
            v-if="canEdit"
            icon
            size="small"
            variant="text"
            color="error"
            @click.stop.prevent="askDelete(d)"
          >
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>

    <div
      v-else
      class="text-caption text-medium-emphasis text-center py-4 docs-empty"
    >
      Chưa có tài liệu nào
    </div>

    <div v-if="canEdit" class="mt-2">
      <v-btn
        v-if="!productId"
        variant="text"
        prepend-icon="mdi-plus"
        disabled
      >
        Lưu sản phẩm trước để thêm tài liệu
      </v-btn>
      <v-btn
        v-else
        variant="text"
        color="primary"
        prepend-icon="mdi-link-plus"
        @click="addDialog = true"
      >
        Thêm tài liệu (link Drive)
      </v-btn>
    </div>

    <!-- Add doc dialog -->
    <v-dialog v-model="addDialog" max-width="520" persistent>
      <v-card>
        <v-card-title>Thêm tài liệu marketing</v-card-title>
        <v-card-text>
          <v-select
            v-model="form.type"
            :items="docTypeItems"
            item-title="text"
            item-value="value"
            label="Loại tài liệu"
            class="mb-3"
            hide-details
          />
          <v-text-field
            v-model="form.name"
            label="Tên hiển thị"
            class="mb-3"
            hide-details="auto"
            :error-messages="errors.name"
          />
          <v-text-field
            v-model="form.driveUrl"
            label="Link Google Drive (https://...)"
            placeholder="https://drive.google.com/file/d/..."
            hide-details="auto"
            :error-messages="errors.driveUrl"
          />
          <v-alert
            v-if="formError"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ formError }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeDialog">Huỷ</v-btn>
          <v-btn color="primary" :loading="adding" @click="onAdd">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirm delete -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card>
        <v-card-title>Xoá tài liệu?</v-card-title>
        <v-card-text>
          Tài liệu <strong>{{ pendingDeleteName }}</strong> sẽ bị gỡ khỏi sản phẩm này. Link Drive vẫn còn ở Drive của bạn.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Huỷ</v-btn>
          <v-btn color="error" @click="confirmDelete">Xoá</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import {
  DOC_TYPE_OPTIONS,
  docIcon,
  useProducts,
  type MarketingDoc,
} from '@/composables/use-products';

const props = defineProps<{
  productId: string | null;
  docs: MarketingDoc[];
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'updated'): void;
  (e: 'error', msg: string): void;
}>();

const docTypeItems = DOC_TYPE_OPTIONS.map((d) => ({ text: d.text, value: d.value }));

function iconFor(type: string) {
  return docIcon(type);
}

function truncateUrl(url: string) {
  if (url.length > 60) return url.slice(0, 60) + '…';
  return url;
}

const { addMarketingDoc, deleteMarketingDoc } = useProducts();

// ── Add ────────────────────────────────────────────────────────────────
const addDialog = ref(false);
const adding = ref(false);
const form = reactive<{ type: string; name: string; driveUrl: string }>({
  type: 'pdf',
  name: '',
  driveUrl: '',
});
const errors = reactive<{ name?: string; driveUrl?: string }>({});
const formError = ref('');

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function closeDialog() {
  addDialog.value = false;
  form.type = 'pdf';
  form.name = '';
  form.driveUrl = '';
  errors.name = undefined;
  errors.driveUrl = undefined;
  formError.value = '';
}

async function onAdd() {
  errors.name = undefined;
  errors.driveUrl = undefined;
  formError.value = '';

  if (!form.name.trim()) {
    errors.name = 'Bắt buộc';
    return;
  }
  if (!form.driveUrl.trim() || !isValidUrl(form.driveUrl.trim())) {
    errors.driveUrl = 'URL không hợp lệ — phải bắt đầu http:// hoặc https://';
    return;
  }
  if (!props.productId) return;

  adding.value = true;
  try {
    await addMarketingDoc(props.productId, {
      type: form.type,
      name: form.name.trim(),
      driveUrl: form.driveUrl.trim(),
    });
    closeDialog();
    emit('updated');
  } catch (err: any) {
    formError.value = err?.response?.data?.error ?? 'Thêm tài liệu thất bại';
  } finally {
    adding.value = false;
  }
}

// ── Delete ─────────────────────────────────────────────────────────────
const deleteDialog = ref(false);
const pendingDeleteId = ref<string | null>(null);
const pendingDeleteName = ref('');

function askDelete(doc: MarketingDoc) {
  pendingDeleteId.value = doc.id;
  pendingDeleteName.value = doc.name;
  deleteDialog.value = true;
}

async function confirmDelete() {
  if (!props.productId || !pendingDeleteId.value) {
    deleteDialog.value = false;
    return;
  }
  try {
    await deleteMarketingDoc(props.productId, pendingDeleteId.value);
    deleteDialog.value = false;
    emit('updated');
  } catch (err: any) {
    deleteDialog.value = false;
    emit('error', err?.response?.data?.error ?? 'Xoá tài liệu thất bại');
  }
}
</script>

<style scoped>
.docs-list {
  background: transparent;
}
.doc-item {
  border-radius: 12px;
  margin-bottom: 4px;
}
.doc-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.docs-empty {
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 12px;
}
</style>
