<template>
  <v-dialog
    :model-value="modelValue"
    max-width="600"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>
        {{ editing ? 'Sửa thông tin lô' : 'Nhập lô mới' }}
      </v-card-title>
      <v-card-text>
        <!-- Product picker — locked when editing or pre-selected -->
        <v-autocomplete
          v-if="!editing && !lockedProduct"
          :model-value="picked"
          :items="results"
          item-title="display"
          item-value="id"
          :loading="searching"
          label="Sản phẩm *"
          placeholder="Tìm SKU hoặc tên..."
          hide-no-data
          hide-details="auto"
          clearable
          return-object
          autofocus
          class="mb-3"
          :error-messages="errors.productId"
          @update:search="onSearch"
          @update:model-value="onPickProduct"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :title="rowOf(item).display">
              <template #subtitle>
                <span class="text-caption">Tồn hiện tại: {{ rowOf(item).totalStock }} {{ rowOf(item).unit }}</span>
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>

        <!-- Locked product display when in product context or editing -->
        <v-alert
          v-else-if="lockedProductInfo"
          type="info"
          variant="tonal"
          density="compact"
          icon="mdi-package"
          class="mb-3"
        >
          {{ lockedProductInfo.name }} <span class="font-mono">({{ lockedProductInfo.sku }})</span>
        </v-alert>

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.batchCode"
              label="Mã lô *"
              placeholder="VD: MNH-MEN-60-2604A"
              :error-messages="errors.batchCode"
              hide-details="auto"
              class="font-mono"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model.number="form.importQuantity"
              :disabled="!!editing"
              type="number"
              :label="editing ? 'Số lượng nhập (không sửa)' : 'Số lượng nhập *'"
              min="1"
              :hint="editing ? 'Để điều chỉnh tồn, dùng nút “Điều chỉnh tồn” sau khi lưu' : ''"
              persistent-hint
              :error-messages="errors.importQuantity"
              hide-details="auto"
              suffix="đv"
              class="font-mono"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.manufactureDate"
              type="date"
              label="Ngày sản xuất"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.expiryDate"
              type="date"
              label="Hạn sử dụng"
              :hint="expiryHint"
              persistent-hint
              hide-details="auto"
            />
          </v-col>
          <v-col v-if="!editing" cols="12">
            <v-text-field
              v-model.number="form.importCost"
              type="number"
              label="Giá nhập / đơn vị (đ)"
              hint="Để trống = lấy từ giá vốn SP"
              persistent-hint
              suffix="đ"
              hide-details="auto"
              class="font-mono"
            />
          </v-col>
          <v-col cols="12">
            <v-textarea
              v-model="form.notes"
              label="Ghi chú"
              rows="2"
              hide-details
            />
          </v-col>
        </v-row>

        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mt-3">
          {{ formError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Huỷ</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="!canSubmit" @click="onSubmit">
          {{ editing ? 'Lưu thay đổi' : 'Nhập lô' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { api } from '@/api/index';
import { useInventory, type Batch } from '@/composables/use-inventory';

interface ProductItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  totalStock: number;
  display: string;
}

const props = defineProps<{
  modelValue: boolean;
  editing: Batch | null;
  /** When invoked from a product detail page, lock the product. */
  lockedProduct?: { id: string; sku: string; name: string } | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'saved', batch: Batch): void;
}>();

const { createBatch, updateBatchMeta, saving } = useInventory();

/** Vuetify's #item slot passes a ListItem wrapper whose `.raw` holds the row.
 *  Typed helper so the template reads the row without `any`. */
function rowOf(item: unknown): ProductItem {
  return (item as { raw: ProductItem }).raw;
}

const results = ref<ProductItem[]>([]);
const searching = ref(false);
const picked = ref<ProductItem | null>(null);

const form = reactive({
  batchCode: '',
  importQuantity: 0,
  manufactureDate: '',
  expiryDate: '',
  importCost: null as number | null,
  notes: '',
});
const errors = reactive<{ productId?: string; batchCode?: string; importQuantity?: string }>({});
const formError = ref('');

const lockedProductInfo = computed(() => {
  if (props.editing) {
    return props.editing.product
      ? { id: props.editing.product.id, sku: props.editing.product.sku, name: props.editing.product.name }
      : null;
  }
  if (props.lockedProduct) return props.lockedProduct;
  return null;
});

const expiryHint = computed(() => {
  if (!form.expiryDate) return '';
  const days = Math.ceil((new Date(form.expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return `Đã hết hạn ${-days} ngày`;
  if (days < 90) return `Còn ${days} ngày — sẽ cảnh báo trong dashboard`;
  return `Còn ${days} ngày`;
});

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
      unit: p.unit,
      totalStock: p.totalStock,
      display: `${p.name} — ${p.sku}`,
    }));
  } finally {
    searching.value = false;
  }
}

function onPickProduct(val: ProductItem | null) {
  picked.value = val;
  errors.productId = undefined;
}

const canSubmit = computed(() => {
  if (!form.batchCode.trim()) return false;
  if (!props.editing && !props.lockedProduct && !picked.value) return false;
  if (!props.editing && (!form.importQuantity || form.importQuantity <= 0)) return false;
  return true;
});

function onCancel() {
  emit('update:modelValue', false);
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) {
      // Reset on close
      Object.assign(form, {
        batchCode: '',
        importQuantity: 0,
        manufactureDate: '',
        expiryDate: '',
        importCost: null,
        notes: '',
      });
      picked.value = null;
      results.value = [];
      errors.productId = undefined;
      errors.batchCode = undefined;
      errors.importQuantity = undefined;
      formError.value = '';
      return;
    }
    // Hydrate when opening
    if (props.editing) {
      form.batchCode = props.editing.batchCode;
      form.importQuantity = props.editing.importQuantity;
      form.manufactureDate = props.editing.manufactureDate?.slice(0, 10) ?? '';
      form.expiryDate = props.editing.expiryDate?.slice(0, 10) ?? '';
      form.notes = props.editing.notes ?? '';
    }
  },
);

async function onSubmit() {
  errors.productId = undefined;
  errors.batchCode = undefined;
  errors.importQuantity = undefined;
  formError.value = '';
  if (!form.batchCode.trim()) {
    errors.batchCode = 'Bắt buộc';
    return;
  }
  try {
    const productId =
      props.editing?.productId ??
      props.lockedProduct?.id ??
      picked.value?.id;
    if (!props.editing && !productId) {
      errors.productId = 'Bắt buộc';
      return;
    }
    if (props.editing) {
      const updated = await updateBatchMeta(props.editing.id, {
        batchCode: form.batchCode.trim(),
        manufactureDate: form.manufactureDate || null,
        expiryDate: form.expiryDate || null,
        notes: form.notes?.trim() || null,
      });
      emit('saved', updated);
    } else {
      const created = await createBatch({
        productId: productId!,
        batchCode: form.batchCode.trim(),
        importQuantity: form.importQuantity,
        manufactureDate: form.manufactureDate || null,
        expiryDate: form.expiryDate || null,
        importCost: form.importCost ?? null,
        notes: form.notes?.trim() || null,
      });
      emit('saved', created);
    }
    emit('update:modelValue', false);
  } catch (err: any) {
    formError.value = err?.message ?? 'Lưu thất bại';
  }
}
</script>

<style scoped>
.font-mono :deep(.v-field__input),
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
