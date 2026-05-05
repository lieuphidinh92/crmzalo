<template>
  <div>
    <v-alert
      v-if="!productId"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3"
    >
      Lưu sản phẩm trước, sau đó hệ thống sẽ tạo sẵn 4 mức giá mặc định để chỉnh.
    </v-alert>

    <v-alert
      v-else
      icon="mdi-lightbulb-on"
      variant="tonal"
      color="primary"
      density="compact"
      class="mb-3"
    >
      Bạn có thể thêm tay các mức giá tuỳ chỉnh ngoài 4 mức mặc định. Kéo thả để đổi thứ tự, click ngôi sao để chọn mức mặc định khi tạo đơn.
    </v-alert>

    <div v-if="productId" class="tier-list">
      <div
        v-for="(tier, idx) in tiers"
        :key="tier.id"
        class="tier-row"
        :class="{ 'tier-row--dragging': draggingId === tier.id }"
        :draggable="canEdit"
        @dragstart="onDragStart(tier.id, $event)"
        @dragover.prevent="onDragOver(idx)"
        @dragend="onDragEnd"
        @drop.prevent="onDrop"
      >
        <v-icon class="drag-handle" :class="{ 'drag-handle--disabled': !canEdit }">
          mdi-drag-vertical
        </v-icon>

        <v-text-field
          v-model="tier.tierName"
          density="compact"
          hide-details
          :readonly="!canEdit"
          class="tier-name"
          @blur="commitTier(tier)"
        />

        <v-text-field
          v-model.number="tier.price"
          type="number"
          density="compact"
          hide-details
          :readonly="!canEdit"
          suffix="đ"
          class="tier-price font-mono"
          @blur="commitTier(tier)"
        />

        <v-btn
          icon
          size="small"
          variant="text"
          :color="tier.isDefault ? 'amber' : ''"
          :disabled="!canEdit"
          :title="tier.isDefault ? 'Đang là mặc định' : 'Đặt làm mặc định'"
          @click="onSetDefault(tier)"
        >
          <v-icon>{{ tier.isDefault ? 'mdi-star' : 'mdi-star-outline' }}</v-icon>
        </v-btn>

        <v-btn
          icon
          size="small"
          variant="text"
          color="error"
          :disabled="!canEdit || tier.isDefault"
          :title="tier.isDefault ? 'Không thể xoá mức đang mặc định' : 'Xoá mức giá'"
          @click="askDelete(tier)"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
    </div>

    <div v-if="productId && canEdit" class="mt-3">
      <v-btn
        variant="text"
        color="primary"
        prepend-icon="mdi-plus"
        @click="addingNew = true"
      >
        Thêm mức giá
      </v-btn>
    </div>

    <!-- Inline add row -->
    <v-card v-if="addingNew" variant="tonal" class="mt-3 pa-3" rounded="lg">
      <v-row dense>
        <v-col cols="12" sm="5">
          <v-text-field
            v-model="newTier.tierName"
            label="Tên mức giá"
            density="compact"
            hide-details
            autofocus
          />
        </v-col>
        <v-col cols="12" sm="5">
          <v-text-field
            v-model.number="newTier.price"
            label="Giá (đ)"
            type="number"
            density="compact"
            hide-details
            suffix="đ"
          />
        </v-col>
        <v-col cols="12" sm="2" class="d-flex align-center justify-end gap-1">
          <v-btn icon size="small" variant="text" @click="cancelAdd">
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-btn icon size="small" color="primary" :loading="adding" @click="confirmAdd">
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Confirm delete -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card>
        <v-card-title>Xoá mức giá?</v-card-title>
        <v-card-text>
          Mức giá <strong>{{ pendingDeleteName }}</strong> sẽ bị ẩn. Bạn có chắc?
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
import { ref, watch, reactive } from 'vue';
import type { ProductPrice } from '@/composables/use-products';
import { useProducts } from '@/composables/use-products';

const props = defineProps<{
  productId: string | null;
  prices: ProductPrice[];
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'updated'): void;
  (e: 'error', msg: string): void;
}>();

const tiers = ref<ProductPrice[]>([]);

watch(
  () => props.prices,
  (next) => {
    tiers.value = next.map((p) => ({ ...p, price: Number(p.price) || 0 }));
  },
  { immediate: true },
);

const {
  addPriceTier,
  updatePriceTier,
  setDefaultPrice,
  reorderPrices,
  deletePriceTier,
} = useProducts();

// ── Drag & drop ─────────────────────────────────────────────────────────
const draggingId = ref<string | null>(null);
let dragFromIndex = -1;
let dragOverIndex = -1;

function onDragStart(id: string, e: DragEvent) {
  if (!props.canEdit) return;
  draggingId.value = id;
  dragFromIndex = tiers.value.findIndex((t) => t.id === id);
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
}

function onDragOver(idx: number) {
  if (!props.canEdit || draggingId.value === null) return;
  dragOverIndex = idx;
  if (dragFromIndex === -1 || dragOverIndex === -1 || dragFromIndex === dragOverIndex) return;
  const moved = tiers.value.splice(dragFromIndex, 1)[0];
  tiers.value.splice(dragOverIndex, 0, moved);
  dragFromIndex = dragOverIndex;
}

async function onDrop() {
  if (!props.canEdit || !props.productId) return;
  draggingId.value = null;
  try {
    await reorderPrices(
      props.productId,
      tiers.value.map((t) => t.id),
    );
    emit('updated');
  } catch (err: any) {
    emit('error', err?.response?.data?.error ?? 'Đổi thứ tự thất bại');
  }
}

function onDragEnd() {
  draggingId.value = null;
}

// ── Inline edit ─────────────────────────────────────────────────────────
async function commitTier(tier: ProductPrice) {
  if (!props.productId || !props.canEdit) return;
  const original = props.prices.find((p) => p.id === tier.id);
  if (!original) return;
  const patch: Partial<ProductPrice> = {};
  if (tier.tierName !== original.tierName) patch.tierName = tier.tierName;
  const newPrice = Number(tier.price) || 0;
  const oldPrice = Number(original.price) || 0;
  if (newPrice !== oldPrice) patch.price = newPrice;
  if (Object.keys(patch).length === 0) return;
  try {
    await updatePriceTier(props.productId, tier.id, patch);
    emit('updated');
  } catch (err: any) {
    emit('error', err?.response?.data?.error ?? 'Cập nhật mức giá thất bại');
  }
}

async function onSetDefault(tier: ProductPrice) {
  if (!props.productId || !props.canEdit || tier.isDefault) return;
  try {
    await setDefaultPrice(props.productId, tier.id);
    emit('updated');
  } catch (err: any) {
    emit('error', err?.response?.data?.error ?? 'Set mặc định thất bại');
  }
}

// ── Delete confirm ──────────────────────────────────────────────────────
const deleteDialog = ref(false);
const pendingDeleteId = ref<string | null>(null);
const pendingDeleteName = ref('');

function askDelete(tier: ProductPrice) {
  pendingDeleteId.value = tier.id;
  pendingDeleteName.value = tier.tierName;
  deleteDialog.value = true;
}

async function confirmDelete() {
  if (!props.productId || !pendingDeleteId.value) {
    deleteDialog.value = false;
    return;
  }
  try {
    await deletePriceTier(props.productId, pendingDeleteId.value);
    deleteDialog.value = false;
    emit('updated');
  } catch (err: any) {
    deleteDialog.value = false;
    emit('error', err?.response?.data?.error ?? 'Xoá thất bại');
  }
}

// ── Add new ─────────────────────────────────────────────────────────────
const addingNew = ref(false);
const adding = ref(false);
const newTier = reactive<{ tierName: string; price: number }>({ tierName: '', price: 0 });

function cancelAdd() {
  addingNew.value = false;
  newTier.tierName = '';
  newTier.price = 0;
}

async function confirmAdd() {
  if (!props.productId) return;
  if (!newTier.tierName.trim()) {
    emit('error', 'Tên mức giá không được rỗng');
    return;
  }
  if (newTier.price < 0 || isNaN(newTier.price)) {
    emit('error', 'Giá phải ≥ 0');
    return;
  }
  adding.value = true;
  try {
    await addPriceTier(props.productId, {
      tierName: newTier.tierName.trim(),
      price: newTier.price,
    });
    cancelAdd();
    emit('updated');
  } catch (err: any) {
    emit('error', err?.response?.data?.error ?? 'Thêm mức giá thất bại');
  } finally {
    adding.value = false;
  }
}
</script>

<style scoped>
.tier-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tier-row {
  display: grid;
  grid-template-columns: 32px 1fr 180px 40px 40px;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.15s ease;
}
.tier-row--dragging {
  opacity: 0.55;
}
.tier-row:hover {
  background: rgba(255, 255, 255, 0.05);
}
.drag-handle {
  cursor: grab;
  color: rgba(255, 255, 255, 0.45);
}
.drag-handle--disabled {
  cursor: default;
  opacity: 0.3;
}
.tier-name :deep(.v-field__input),
.tier-price :deep(.v-field__input) {
  font-size: 0.875rem;
}
.font-mono :deep(.v-field__input) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.gap-1 {
  gap: 4px;
}

@media (max-width: 600px) {
  .tier-row {
    grid-template-columns: 28px 1fr 140px 36px 36px;
    gap: 4px;
    padding: 4px 6px;
  }
}
</style>
