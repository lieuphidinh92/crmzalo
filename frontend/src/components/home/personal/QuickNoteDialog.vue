<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <span style="font-size: 20px;">📞</span>
        <span class="ml-2">Ghi chú cuộc gọi nhanh</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="open = false" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-autocomplete
          v-model="selectedContactId"
          :items="searchResults"
          :loading="searching"
          :search-input.sync="searchQuery"
          item-title="label"
          item-value="id"
          label="Khách hàng"
          placeholder="Gõ tên hoặc SĐT..."
          no-filter
          clearable
          density="comfortable"
          @update:search="onSearch"
        />
        <v-textarea
          v-model="noteText"
          label="Nội dung cuộc gọi"
          placeholder="Khách nói gì? Cần follow-up gì tiếp?"
          rows="4"
          auto-grow
          density="comfortable"
          class="mt-2"
        />
        <v-alert
          v-if="errorMsg"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-2"
        >{{ errorMsg }}</v-alert>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Huỷ</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!selectedContactId || !noteText.trim()"
          prepend-icon="mdi-content-save"
          @click="onSave"
        >
          Lưu vào ghi chú KH
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api/index';

interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved', contactId: string): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const searchQuery = ref('');
const searchResults = ref<Array<{ id: string; label: string }>>([]);
const selectedContactId = ref<string | null>(null);
const noteText = ref('');
const saving = ref(false);
const searching = ref(false);
const errorMsg = ref('');

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearch(q: string) {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(q), 250);
}

async function doSearch(q: string) {
  if (!q || q.length < 1) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    const res = await api.get('/contacts', {
      params: { search: q, limit: 10 },
    });
    const list = (res.data.contacts ?? []) as Array<{
      id: string;
      fullName: string | null;
      phone: string | null;
      storeName?: string | null;
    }>;
    searchResults.value = list.map((c) => ({
      id: c.id,
      label: [c.fullName ?? '(không tên)', c.storeName, c.phone]
        .filter(Boolean)
        .join(' · '),
    }));
  } finally {
    searching.value = false;
  }
}

watch(open, (v) => {
  if (!v) {
    selectedContactId.value = null;
    noteText.value = '';
    searchQuery.value = '';
    searchResults.value = [];
    errorMsg.value = '';
  }
});

async function onSave() {
  if (!selectedContactId.value || !noteText.value.trim()) return;
  saving.value = true;
  errorMsg.value = '';
  try {
    // Append to contact.notes (preserves existing). Fetch current first so
    // we don't clobber.
    const cur = await api.get(`/contacts/${selectedContactId.value}`);
    const existing = cur.data?.notes ?? '';
    const stamp = new Date().toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const newNotes = existing
      ? `${existing}\n\n[${stamp}] 📞 ${noteText.value.trim()}`
      : `[${stamp}] 📞 ${noteText.value.trim()}`;
    await api.put(`/contacts/${selectedContactId.value}`, {
      notes: newNotes,
    });
    emit('saved', selectedContactId.value);
    open.value = false;
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error ?? 'Lưu thất bại';
  } finally {
    saving.value = false;
  }
}
</script>
