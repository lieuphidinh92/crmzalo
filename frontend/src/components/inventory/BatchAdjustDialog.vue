<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card v-if="batch">
      <v-card-title>
        Điều chỉnh tồn — {{ batch.batchCode }}
      </v-card-title>
      <v-card-text>
        <v-alert type="info" variant="tonal" density="compact" class="mb-3">
          Tồn hiện tại: <strong class="font-mono">{{ batch.currentQuantity }}</strong>
          {{ batch.product?.unit ?? '' }}
        </v-alert>

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-radio-group
              v-model="form.direction"
              inline
              hide-details
              class="mb-2"
            >
              <v-radio label="Tăng (+)" value="add" />
              <v-radio label="Giảm (−)" value="sub" />
            </v-radio-group>
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model.number="form.amount"
              type="number"
              label="Số lượng"
              min="1"
              :error-messages="errors.amount"
              hide-details="auto"
              class="font-mono"
              suffix="đv"
            />
          </v-col>
        </v-row>

        <v-textarea
          v-model="form.reason"
          label="Lý do điều chỉnh *"
          rows="3"
          placeholder="VD: Kiểm kê tháng 5, vỡ 2 hộp do vận chuyển, nhầm lẫn ghi nhận..."
          class="mt-3"
          hide-details="auto"
          :error-messages="errors.reason"
        />

        <v-alert
          v-if="resultPreview !== null"
          :type="resultPreview < 0 ? 'warning' : 'success'"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          Sau điều chỉnh: <strong class="font-mono">{{ resultPreview }}</strong>
          {{ batch.product?.unit ?? '' }}
          <div v-if="resultPreview < 0" class="text-caption mt-1">
            ⚠ Tồn sẽ âm — đây thường là dấu hiệu lỗi đếm. Kiểm tra lại trước khi xác nhận.
          </div>
        </v-alert>

        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mt-3">
          {{ formError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Huỷ</v-btn>
        <v-btn
          :color="resultPreview !== null && resultPreview < 0 ? 'warning' : 'primary'"
          :loading="saving"
          :disabled="!canSubmit"
          @click="onSubmit"
        >
          {{ resultPreview !== null && resultPreview < 0 ? 'Vẫn ghi nhận' : 'Lưu điều chỉnh' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useInventory, type Batch } from '@/composables/use-inventory';

const props = defineProps<{
  modelValue: boolean;
  batch: Batch | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'saved', batch: Batch): void;
}>();

const { adjustBatch, saving } = useInventory();

const form = reactive<{ direction: 'add' | 'sub'; amount: number; reason: string }>({
  direction: 'add',
  amount: 1,
  reason: '',
});
const errors = reactive<{ amount?: string; reason?: string }>({});
const formError = ref('');

const delta = computed(() => {
  const a = Number(form.amount) || 0;
  return form.direction === 'add' ? a : -a;
});

const resultPreview = computed(() => {
  if (!props.batch || !form.amount || form.amount <= 0) return null;
  return props.batch.currentQuantity + delta.value;
});

const canSubmit = computed(() => {
  if (!form.amount || form.amount <= 0) return false;
  if (!form.reason.trim()) return false;
  return true;
});

watch(
  () => props.modelValue,
  (v) => {
    if (!v) {
      form.direction = 'add';
      form.amount = 1;
      form.reason = '';
      errors.amount = undefined;
      errors.reason = undefined;
      formError.value = '';
    }
  },
);

function onCancel() {
  emit('update:modelValue', false);
}

async function onSubmit() {
  errors.amount = undefined;
  errors.reason = undefined;
  formError.value = '';
  if (!form.amount || form.amount <= 0) {
    errors.amount = 'Phải > 0';
    return;
  }
  if (!form.reason.trim()) {
    errors.reason = 'Bắt buộc';
    return;
  }
  if (!props.batch) return;
  try {
    const updated = await adjustBatch(props.batch.id, delta.value, form.reason.trim());
    emit('saved', updated);
    emit('update:modelValue', false);
  } catch (err: any) {
    formError.value = err?.message ?? 'Điều chỉnh thất bại';
  }
}
</script>

<style scoped>
.font-mono :deep(.v-field__input),
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
