<template>
  <v-dialog v-model="open" max-width="640" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-package-variant-plus</v-icon>
        {{ editingMode ? 'Sửa lô hàng' : 'Thêm sản phẩm' }}
      </v-card-title>
      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <!-- Product autocomplete (sku / name) -->
          <v-autocomplete
            v-model="form.productId"
            :items="productOptions"
            :loading="searching"
            :search-input.sync="search"
            item-title="label"
            item-value="id"
            label="Sản phẩm *"
            placeholder="Gõ SKU hoặc tên SP"
            prepend-inner-icon="mdi-magnify"
            no-filter
            clearable
            :rules="[(v) => !!v || 'Bắt buộc chọn SP']"
            @update:search="onSearch"
            @update:model-value="onPickProduct"
          >
            <template #item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps">
                <template #title>
                  <span class="font-mono text-caption">{{ rowOf(item).sku }}</span>
                  · {{ rowOf(item).name }}
                </template>
                <template #subtitle>
                  <span class="text-caption text-medium-emphasis">
                    Đơn vị: {{ rowOf(item).unit ?? '—' }}
                    <span v-if="rowOf(item).costPrice"> · Giá vốn TB: {{ formatVNDFull(rowOf(item).costPrice) }}</span>
                  </span>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>

          <v-row dense>
            <v-col cols="6">
              <v-text-field
                v-model.number="form.quantity"
                label="Số lượng *"
                type="number"
                min="1"
                step="1"
                :rules="[(v) => Number(v) > 0 || 'Phải > 0']"
                suffix="hộp"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model.number="form.unitCost"
                label="Giá nhập / đơn vị *"
                type="number"
                min="1"
                :rules="[(v) => Number(v) > 0 || 'Phải > 0']"
                suffix="đ"
              />
            </v-col>
          </v-row>

          <v-text-field
            v-model="form.batchCode"
            label="Mã lô *"
            placeholder="VD L2605-A"
            :hint="batchHint"
            persistent-hint
            :rules="[(v) => !!v?.trim() || 'Bắt buộc nhập mã lô']"
          />

          <v-row dense class="mt-1">
            <v-col cols="6">
              <v-text-field
                v-model="form.manufactureDate"
                label="Ngày sản xuất"
                type="date"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="form.expiryDate"
                label="Hạn sử dụng *"
                type="date"
                :rules="[
                  (v) => !!v || 'Bắt buộc nhập HSD',
                  () => isExpiryAfterMfg || 'HSD phải sau NSX',
                ]"
              />
            </v-col>
          </v-row>

          <v-textarea
            v-model="form.notes"
            label="Ghi chú lô"
            rows="2"
            hide-details
            class="mt-2"
          />

          <!-- Live total preview -->
          <div class="line-total mt-3">
            <span class="text-caption text-medium-emphasis">Thành tiền</span>
            <span class="line-total__value">
              {{ formatVNDFull(linePreview) }}
            </span>
          </div>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Huỷ</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!formValid"
          @click="onSubmit"
        >
          {{ editingMode ? 'Lưu' : 'Thêm vào đơn' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api/index';
import {
  formatVNDFull,
  suggestBatchCode,
  type ImportLine,
} from '@/composables/use-imports';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  unit: string | null;
  costPrice: number | string | null;
  label: string;
}

interface FormState {
  productId: string | null;
  productSku: string;
  productName: string;
  productUnit: string | null;
  quantity: number;
  unitCost: number;
  batchCode: string;
  manufactureDate: string | null;
  expiryDate: string | null;
  notes: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  /** Existing line being edited (null/undefined when creating). */
  line?: ImportLine | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [line: Omit<ImportLine, 'id' | 'lineTotal'>];
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});
const editingMode = computed(() => !!props.line);

/** Vuetify's #item slot passes a ListItem wrapper whose `.raw` holds the row.
 *  Typed helper so the template reads the row without `any`. */
function rowOf(item: unknown): ProductRow {
  return (item as { raw: ProductRow }).raw;
}

const formRef = ref<any>(null);
const formValid = ref(false);
const search = ref('');
const searching = ref(false);
const productOptions = ref<ProductRow[]>([]);

const blankForm: FormState = {
  productId: null,
  productSku: '',
  productName: '',
  productUnit: null,
  quantity: 1,
  unitCost: 0,
  batchCode: suggestBatchCode(),
  manufactureDate: null,
  expiryDate: null,
  notes: null,
};
const form = ref<FormState>({ ...blankForm });

const linePreview = computed(() => {
  const q = Number(form.value.quantity) || 0;
  const c = Number(form.value.unitCost) || 0;
  return q * c;
});

const isExpiryAfterMfg = computed(() => {
  const m = form.value.manufactureDate;
  const e = form.value.expiryDate;
  if (!m || !e) return true;
  return new Date(e) > new Date(m);
});

const batchHint = computed(() =>
  `Gợi ý: ${suggestBatchCode()} (đã điền sẵn — đổi nếu NCC dùng mã khác)`,
);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

async function onSearch(value: string) {
  search.value = value ?? '';
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (!value || value.trim().length < 1) {
      productOptions.value = [];
      return;
    }
    searching.value = true;
    try {
      const { data } = await api.get('/products', {
        params: { search: value, limit: 25 },
      });
      const rows: ProductRow[] = (data?.products ?? data ?? []).map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit ?? null,
        costPrice: p.costPrice ?? null,
        label: `${p.sku} — ${p.name}`,
      }));
      productOptions.value = rows;
    } catch (err) {
      console.error('[ItemPicker] search failed:', err);
    } finally {
      searching.value = false;
    }
  }, 200);
}

function onPickProduct(id: string | null) {
  const product = productOptions.value.find((p) => p.id === id);
  if (product) {
    form.value.productSku = product.sku;
    form.value.productName = product.name;
    form.value.productUnit = product.unit;
    if (!form.value.unitCost && product.costPrice) {
      form.value.unitCost = Number(product.costPrice);
    }
  }
}

watch(
  () => props.line,
  (line) => {
    if (line) {
      form.value = {
        productId: line.productId,
        productSku: line.product?.sku ?? '',
        productName: line.product?.name ?? '',
        productUnit: line.product?.unit ?? null,
        quantity: line.quantity,
        unitCost: Number(line.unitCost) || 0,
        batchCode: line.batchCode,
        manufactureDate: line.manufactureDate?.slice(0, 10) ?? null,
        expiryDate: line.expiryDate?.slice(0, 10) ?? null,
        notes: line.notes,
      };
      // Pre-populate dropdown so the autocomplete shows the chosen SP.
      productOptions.value = [
        {
          id: line.productId,
          sku: line.product?.sku ?? '',
          name: line.product?.name ?? '',
          unit: line.product?.unit ?? null,
          costPrice: null,
          label: `${line.product?.sku ?? ''} — ${line.product?.name ?? ''}`,
        },
      ];
    } else {
      form.value = { ...blankForm, batchCode: suggestBatchCode() };
      productOptions.value = [];
    }
  },
  { immediate: true },
);

function onCancel() {
  open.value = false;
}

async function onSubmit() {
  const valid = await formRef.value?.validate?.();
  if (valid && valid.valid === false) return;
  if (!form.value.productId) return;
  emit('save', {
    productId: form.value.productId,
    batchCode: form.value.batchCode.trim(),
    quantity: Math.round(form.value.quantity),
    unitCost: Number(form.value.unitCost),
    manufactureDate: form.value.manufactureDate || null,
    expiryDate: form.value.expiryDate || null,
    notes: form.value.notes?.trim() || null,
    product: {
      id: form.value.productId,
      sku: form.value.productSku,
      name: form.value.productName,
      unit: form.value.productUnit,
    },
  });
  open.value = false;
}
</script>

<style scoped>
.line-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 12px;
  background: rgba(148, 163, 184, 0.06);
  border-radius: 8px;
}
.line-total__value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  font-size: 1.05rem;
  color: rgb(var(--v-theme-primary));
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
