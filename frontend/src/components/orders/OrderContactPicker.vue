<template>
  <div>
    <v-autocomplete
      :model-value="modelValue"
      :items="results"
      item-title="display"
      item-value="id"
      :loading="loading"
      :disabled="disabled"
      label="Khách hàng *"
      placeholder="Tìm theo tên / SĐT / cửa hàng..."
      no-data-text="Không tìm thấy KH phù hợp"
      hide-no-data
      hide-details
      clearable
      return-object
      @update:search="onSearch"
      @update:model-value="onPick"
    >
      <template #item="{ props: itemProps, item }">
        <v-list-item v-bind="itemProps" :title="rowOf(item).display">
          <template #subtitle>
            <span v-if="rowOf(item).storeName" class="text-caption">{{ rowOf(item).storeName }}</span>
            <span v-if="rowOf(item).policyTier" class="text-caption text-medium-emphasis ml-1">
              · {{ tierLabel(rowOf(item).policyTier!) }}
            </span>
          </template>
        </v-list-item>
      </template>
    </v-autocomplete>

    <v-card v-if="picked" variant="tonal" class="mt-3 pa-3" rounded="lg">
      <div class="d-flex align-center" style="gap: 12px;">
        <v-avatar :color="avatarColor" size="40">
          <span class="text-body-2 font-weight-bold">{{ initials }}</span>
        </v-avatar>
        <div class="flex-grow-1">
          <div class="font-weight-medium">{{ picked.fullName }}</div>
          <div class="text-caption text-medium-emphasis">
            <v-icon size="12" class="mr-1">mdi-phone</v-icon>{{ picked.phone || '—' }}
            <span v-if="picked.storeName" class="ml-3">
              <v-icon size="12" class="mr-1">mdi-store</v-icon>{{ picked.storeName }}
            </span>
          </div>
          <div v-if="picked.address" class="text-caption text-medium-emphasis">
            <v-icon size="12" class="mr-1">mdi-map-marker</v-icon>{{ picked.address }}
          </div>
        </div>
        <div class="text-right d-flex flex-column" style="gap: 4px;">
          <v-chip v-if="picked.policyTier" size="x-small" color="primary" variant="tonal">
            {{ tierLabel(picked.policyTier) }}
          </v-chip>
          <v-chip v-if="picked.stage" size="x-small" variant="tonal">
            {{ stageLabel(picked.stage) }}
          </v-chip>
        </div>
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api } from '@/api/index';

interface ContactPickerItem {
  id: string;
  display: string;
  fullName: string | null;
  phone: string | null;
  storeName: string | null;
  province: string | null;
  address: string | null;
  policyTier: string | null;
  stage: string | null;
  assignedUserId: string | null;
}

const props = defineProps<{
  modelValue: ContactPickerItem | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: ContactPickerItem | null): void;
}>();

const results = ref<ContactPickerItem[]>([]);
const loading = ref(false);
const picked = computed(() => props.modelValue);

/** Vuetify's #item slot passes a ListItem wrapper whose `.raw` holds the row.
 *  Typed helper so the template reads the row without `any`. */
function rowOf(item: unknown): ContactPickerItem {
  return (item as { raw: ContactPickerItem }).raw;
}

let debouncer: ReturnType<typeof setTimeout> | null = null;
function onSearch(text: string) {
  if (debouncer) clearTimeout(debouncer);
  debouncer = setTimeout(() => doSearch(text), 250);
}

async function doSearch(text: string) {
  if (!text || text.length < 2) {
    results.value = picked.value ? [picked.value] : [];
    return;
  }
  loading.value = true;
  try {
    const res = await api.get('/contacts', { params: { search: text, limit: 20 } });
    results.value = (res.data.contacts ?? []).map((c: any) => ({
      id: c.id,
      display: `${c.fullName ?? '(Chưa tên)'} — ${c.phone ?? ''}`,
      fullName: c.fullName,
      phone: c.phone,
      storeName: c.storeName,
      province: c.province,
      address: c.address,
      policyTier: c.policyTier,
      stage: c.stage,
      assignedUserId: c.assignedUserId,
    }));
  } catch (err) {
    console.error('[contact-picker] search error:', err);
  } finally {
    loading.value = false;
  }
}

function onPick(val: ContactPickerItem | null) {
  emit('update:modelValue', val);
}

watch(
  () => props.modelValue,
  (v) => {
    if (v && !results.value.find((r) => r.id === v.id)) {
      results.value = [v];
    }
  },
  { immediate: true },
);

const TIER_LABELS: Record<string, string> = {
  ctv: 'CTV',
  dai_ly_cap_1: 'Đại lý cấp 1',
  dai_ly_cap_2: 'Đại lý cấp 2 (VIP)',
};
function tierLabel(t: string) {
  return TIER_LABELS[t] ?? t;
}

const STAGE_LABELS: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
  dai_ly_chinh_thuc: 'Đại lý chính thức',
  ngung: 'Ngừng hợp tác',
};
function stageLabel(s: string) {
  return STAGE_LABELS[s] ?? s;
}

const initials = computed(() => {
  const name = picked.value?.fullName ?? '';
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
});
const avatarColor = computed(() => {
  const colors = ['primary', 'secondary', 'success', 'info', 'warning'];
  const name = picked.value?.fullName ?? '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
});
</script>
