<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>Thêm quà tặng kèm</v-card-title>
      <v-card-text>
        <v-radio-group v-model="form.kind" inline hide-details class="mb-3">
          <v-radio label="Quà SP có sẵn" value="product" />
          <v-radio label="Quà custom" value="custom" />
        </v-radio-group>

        <template v-if="form.kind === 'product'">
          <v-autocomplete
            :model-value="picked"
            :items="results"
            item-title="display"
            item-value="id"
            label="Chọn sản phẩm"
            :loading="searching"
            hide-no-data
            hide-details
            clearable
            return-object
            class="mb-3"
            @update:search="onSearch"
            @update:model-value="onPickProduct"
          />
          <v-select
            v-if="picked"
            v-model="form.batchId"
            :items="batchItems"
            item-title="text"
            item-value="value"
            label="Lô (bắt buộc — sẽ trừ kho khi giao hàng)"
            :loading="batchesLoading"
            class="mb-3"
            hide-details
          />
        </template>

        <template v-else>
          <v-text-field
            v-model="form.giftName"
            label="Tên quà custom *"
            placeholder='VD: "Túi vải Manhae", "Mũ tặng kèm"'
            class="mb-3"
            hide-details="auto"
            :error-messages="errors.giftName"
          />
        </template>

        <v-text-field
          v-model.number="form.quantity"
          type="number"
          label="Số lượng"
          min="1"
          hide-details
          class="mb-3"
        />

        <v-text-field
          v-model="form.note"
          label="Ghi chú (optional)"
          hide-details
        />

        <v-alert
          v-if="form.kind === 'custom'"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          Quà custom KHÔNG trừ kho. Phù hợp với quà ngoài catalog (túi, mũ, voucher...).
        </v-alert>

        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mt-2">
          {{ formError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Huỷ</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="!canSubmit" @click="onSubmit">
          Thêm quà
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { api } from '@/api/index';
import { useBatches, formatBatchOption } from '@/composables/use-batches';

interface ProductItem { id: string; sku: string; name: string; display: string; }

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'add', payload: { productId: string | null; batchId: string | null; giftName: string; quantity: number; note: string | null }): void;
}>();

const form = reactive({
  kind: 'product' as 'product' | 'custom',
  batchId: null as string | null,
  giftName: '',
  quantity: 1,
  note: '',
});
const errors = reactive<{ giftName?: string }>({});
const formError = ref('');
const saving = ref(false);

const results = ref<ProductItem[]>([]);
const searching = ref(false);
const picked = ref<ProductItem | null>(null);
const { batches, loading: batchesLoading, fetchProductBatches } = useBatches();

let debouncer: ReturnType<typeof setTimeout> | null = null;
function onSearch(text: string) {
  if (debouncer) clearTimeout(debouncer);
  debouncer = setTimeout(() => doSearch(text), 250);
}
async function doSearch(text: string) {
  if (!text || text.length < 1) {
    results.value = [];
    return;
  }
  searching.value = true;
  try {
    const res = await api.get('/products', { params: { search: text, limit: 20 } });
    results.value = (res.data.products ?? []).map((p: any) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      display: `${p.name} — ${p.sku}`,
    }));
  } finally {
    searching.value = false;
  }
}
async function onPickProduct(val: ProductItem | null) {
  picked.value = val;
  if (!val) return;
  await fetchProductBatches(val.id);
  form.batchId = batches.value[0]?.id ?? null;
}

const batchItems = computed(() =>
  batches.value.map((b) => ({
    text: formatBatchOption(b),
    value: b.id,
  })),
);

const canSubmit = computed(() => {
  if (form.quantity <= 0) return false;
  if (form.kind === 'product') return !!picked.value && !!form.batchId;
  return !!form.giftName.trim();
});

async function onSubmit() {
  errors.giftName = undefined;
  formError.value = '';
  if (form.kind === 'custom' && !form.giftName.trim()) {
    errors.giftName = 'Bắt buộc';
    return;
  }
  saving.value = true;
  try {
    emit('add', {
      productId: form.kind === 'product' ? picked.value?.id ?? null : null,
      batchId: form.kind === 'product' ? form.batchId : null,
      giftName: form.kind === 'product' ? picked.value?.name ?? form.giftName : form.giftName.trim(),
      quantity: form.quantity,
      note: form.note?.trim() || null,
    });
    onCancel();
  } catch (err: any) {
    formError.value = err?.message ?? 'Thêm quà thất bại';
  } finally {
    saving.value = false;
  }
}
function onCancel() {
  emit('update:modelValue', false);
  form.kind = 'product';
  form.batchId = null;
  form.giftName = '';
  form.quantity = 1;
  form.note = '';
  picked.value = null;
  results.value = [];
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) onCancel();
  },
);
</script>
