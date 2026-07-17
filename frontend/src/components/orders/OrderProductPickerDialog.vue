<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>Thêm sản phẩm vào đơn</v-card-title>
      <v-card-text>
        <v-autocomplete
          :model-value="picked"
          :items="results"
          item-title="display"
          item-value="id"
          :loading="searching"
          label="Tìm sản phẩm (SKU hoặc tên)"
          placeholder="VD: MNH, Manhae..."
          hide-no-data
          hide-details
          clearable
          return-object
          autofocus
          class="mb-3"
          @update:search="onSearch"
          @update:model-value="onPickProduct"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :title="rowOf(item).display">
              <template #subtitle>
                <span class="text-caption">
                  Tồn: {{ rowOf(item).totalStock }} {{ rowOf(item).unit }}
                  · {{ formatVND(rowOf(item).defaultPrice) }}
                </span>
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>

        <div v-if="picked" class="mb-3">
          <div class="d-flex align-center mb-2" style="gap: 12px;">
            <v-img
              v-if="picked.mainImageUrl"
              :src="picked.mainImageUrl"
              max-width="64"
              max-height="64"
              cover
              class="rounded"
            />
            <div>
              <div class="font-weight-medium">{{ picked.name }}</div>
              <div class="text-caption text-medium-emphasis font-mono">{{ picked.sku }}</div>
            </div>
          </div>

          <v-select
            v-model="form.batchId"
            :items="batchItems"
            item-title="text"
            item-value="value"
            label="Chọn lô (mặc định FIFO — HSD gần nhất trước)"
            :disabled="batchesLoading"
            :loading="batchesLoading"
            hide-details
            class="mb-3"
          >
            <template #selection="{ item }">
              <span class="font-mono text-body-2">{{ selectionTitle(item) }}</span>
            </template>
          </v-select>

          <div v-if="!batchesLoading && batchItems.length === 0" class="text-caption text-error mb-2">
            <v-icon size="14" class="mr-1">mdi-alert</v-icon>
            Sản phẩm này chưa có lô nào còn hàng
          </div>

          <v-text-field
            v-model.number="form.quantity"
            type="number"
            label="Số lượng"
            min="1"
            :max="maxQuantity"
            :hint="maxQuantity ? `Tối đa ${maxQuantity} (theo lô đã chọn)` : ''"
            persistent-hint
            class="mb-3"
            hide-details="auto"
            :error-messages="qtyError"
          />

          <v-select
            v-model="form.priceTierId"
            :items="tierItems"
            item-title="text"
            item-value="value"
            label="Mức giá"
            :hint="recommendedHint"
            persistent-hint
            class="mb-2"
            hide-details="auto"
            @update:model-value="onTierChange"
          />

          <v-text-field
            v-model.number="form.unitPrice"
            type="number"
            label="Đơn giá (đ)"
            suffix="đ"
            class="font-mono mb-2"
            hide-details
          />

          <v-alert v-if="lineTotal" variant="tonal" color="primary" density="compact">
            Thành tiền: <strong class="font-mono">{{ formatVND(lineTotal) }}</strong>
          </v-alert>

          <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mt-2">
            {{ formError }}
          </v-alert>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Huỷ</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="!canSubmit" @click="onSubmit">
          Thêm vào đơn
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { api } from '@/api/index';
import { useBatches, formatBatchOption, type Batch } from '@/composables/use-batches';
import { formatVND } from '@/composables/use-orders';

interface ProductItem {
  id: string;
  sku: string;
  name: string;
  mainImageUrl: string | null;
  unit: string;
  totalStock: number;
  defaultPrice: number;
  display: string;
}

interface PriceTier {
  id: string;
  tierName: string;
  price: number | string;
  isDefault: boolean;
  displayOrder: number;
}

const props = defineProps<{
  modelValue: boolean;
  contactPolicyTier?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'add', payload: { productId: string; batchId: string | null; priceTierId: string | null; quantity: number; unitPrice: number }): void;
}>();

const results = ref<ProductItem[]>([]);
const searching = ref(false);
const picked = ref<ProductItem | null>(null);
const tiers = ref<PriceTier[]>([]);

/** Vuetify's #item slot passes a ListItem wrapper whose `.raw` holds the row. */
function rowOf(item: unknown): ProductItem {
  return (item as { raw: ProductItem }).raw;
}
/** Vuetify's #selection slot exposes `.title` (mapped from item-title="text"). */
function selectionTitle(item: unknown): string {
  return (item as { title: string }).title;
}

const { batches, loading: batchesLoading, fetchProductBatches } = useBatches();

const form = reactive({
  batchId: null as string | null,
  quantity: 1,
  priceTierId: null as string | null,
  unitPrice: 0,
});
const formError = ref('');
const saving = ref(false);

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
    const products = res.data.products ?? [];
    results.value = products.map((p: any) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      mainImageUrl: p.mainImageUrl,
      unit: p.unit,
      totalStock: p.totalStock,
      defaultPrice: Number(p.prices?.find((tier: any) => tier.isDefault)?.price ?? 0),
      display: `${p.name} — ${p.sku}`,
    }));
  } finally {
    searching.value = false;
  }
}

async function onPickProduct(val: ProductItem | null) {
  picked.value = val;
  if (!val) {
    tiers.value = [];
    batches.value = [];
    return;
  }
  await fetchProductBatches(val.id);
  // Pick FIFO batch by default — already sorted earliest expiry first by API
  form.batchId = batches.value[0]?.id ?? null;

  // Fetch full product detail for tiers
  try {
    const res = await api.get(`/products/${val.id}`);
    tiers.value = (res.data.prices ?? []).map((p: any) => ({
      id: p.id,
      tierName: p.tierName,
      price: Number(p.price),
      isDefault: p.isDefault,
      displayOrder: p.displayOrder,
    }));
    pickRecommendedTier();
  } catch (err) {
    console.error('[product-picker] fetch tiers error:', err);
  }
  form.quantity = 1;
}

function pickRecommendedTier() {
  // Try to match contact's policy tier name to a product tier name (loose).
  // Fallback to default tier.
  const policyTier = props.contactPolicyTier;
  let candidate: PriceTier | undefined;
  if (policyTier === 'ctv') candidate = tiers.value.find((t) => t.tierName.toLowerCase().includes('ctv'));
  if (policyTier === 'dai_ly_cap_1') candidate = tiers.value.find((t) => t.tierName.toLowerCase().includes('cấp 1') || t.tierName.toLowerCase().includes('cap 1'));
  if (policyTier === 'dai_ly_cap_2') candidate = tiers.value.find((t) => t.tierName.toLowerCase().includes('cấp 2') || t.tierName.toLowerCase().includes('vip'));
  if (!candidate) candidate = tiers.value.find((t) => t.isDefault) ?? tiers.value[0];
  if (candidate) {
    form.priceTierId = candidate.id;
    form.unitPrice = Number(candidate.price);
  }
}

function onTierChange(tierId: string) {
  const t = tiers.value.find((x) => x.id === tierId);
  if (t) form.unitPrice = Number(t.price);
}

const batchItems = computed(() =>
  batches.value.map((b: Batch) => ({
    text: formatBatchOption(b) + (b.warning === 'expiring_soon' ? '  ⚠ sắp hết hạn' : ''),
    value: b.id,
  })),
);

const tierItems = computed(() =>
  tiers.value.map((t) => ({
    text: `${t.tierName} — ${formatVND(t.price)}`,
    value: t.id,
  })),
);

const recommendedHint = computed(() => {
  const policyTier = props.contactPolicyTier;
  const TIER_LABEL: Record<string, string> = {
    ctv: 'CTV',
    dai_ly_cap_1: 'Đại lý cấp 1',
    dai_ly_cap_2: 'Đại lý cấp 2 (VIP)',
  };
  if (!policyTier) return 'KH chưa có policy_tier — dùng tier mặc định của SP';
  return `KH thuộc tier "${TIER_LABEL[policyTier] ?? policyTier}" — đã chọn tier phù hợp`;
});

const maxQuantity = computed(() => {
  if (!form.batchId) return 0;
  const b = batches.value.find((x) => x.id === form.batchId);
  return b?.currentQuantity ?? 0;
});

const qtyError = computed(() => {
  if (!form.quantity || form.quantity <= 0) return 'SL phải > 0';
  if (maxQuantity.value && form.quantity > maxQuantity.value) {
    return `Vượt tồn lô (${maxQuantity.value})`;
  }
  return '';
});

const lineTotal = computed(() => form.quantity * form.unitPrice);

const canSubmit = computed(() => {
  if (!picked.value) return false;
  if (!form.batchId && batchItems.value.length > 0) return false;
  if (form.quantity <= 0) return false;
  if (qtyError.value) return false;
  if (form.unitPrice < 0) return false;
  return true;
});

async function onSubmit() {
  if (!picked.value) return;
  formError.value = '';
  saving.value = true;
  try {
    emit('add', {
      productId: picked.value.id,
      batchId: form.batchId,
      priceTierId: form.priceTierId,
      quantity: form.quantity,
      unitPrice: form.unitPrice,
    });
    onCancel();
  } catch (err: any) {
    formError.value = err?.message ?? 'Thêm sản phẩm thất bại';
  } finally {
    saving.value = false;
  }
}

function onCancel() {
  picked.value = null;
  results.value = [];
  tiers.value = [];
  batches.value = [];
  form.batchId = null;
  form.quantity = 1;
  form.priceTierId = null;
  form.unitPrice = 0;
  formError.value = '';
  emit('update:modelValue', false);
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) {
      picked.value = null;
      results.value = [];
    }
  },
);
</script>

<style scoped>
.font-mono :deep(.v-field__input),
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
