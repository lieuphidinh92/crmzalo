<template>
  <v-dialog :model-value="modelValue" max-width="520" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ editingId ? 'Sửa brand' : 'Thêm brand mới' }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="form.name"
          label="Tên brand *"
          class="mb-3"
          hide-details="auto"
          :error-messages="errors.name"
          autofocus
        />
        <v-select
          v-model="form.supplierId"
          :items="supplierItems"
          item-title="text"
          item-value="value"
          label="Nhà cung cấp"
          class="mb-3"
          clearable
          hide-details
        />
        <v-textarea
          v-model="form.description"
          label="Mô tả"
          rows="3"
          class="mb-3"
          hide-details
        />
        <v-text-field
          v-model="form.logoUrl"
          label="URL logo (optional)"
          placeholder="https://..."
          class="mb-3"
          hide-details
        />
        <v-switch
          v-model="form.active"
          label="Đang hoạt động"
          color="success"
          hide-details
        />
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mt-3">
          {{ formError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Huỷ</v-btn>
        <v-btn color="primary" :loading="saving" @click="onSubmit">
          Lưu
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useBrands, type Brand, type Supplier } from '@/composables/use-brands';

const props = defineProps<{
  modelValue: boolean;
  editing: Brand | null;
  suppliers: Supplier[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'saved', brand: Brand): void;
}>();

const { createBrand, updateBrand } = useBrands();
const saving = ref(false);

const editingId = computed(() => props.editing?.id ?? null);

const form = reactive({
  name: '',
  supplierId: null as string | null,
  description: '',
  logoUrl: '',
  active: true,
});

const errors = reactive<{ name?: string }>({});
const formError = ref('');

const supplierItems = computed(() =>
  props.suppliers
    .filter((s) => s.active)
    .map((s) => ({
      text: s.country ? `${s.name} (${s.country})` : s.name,
      value: s.id,
    })),
);

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      const e = props.editing;
      form.name = e?.name ?? '';
      form.supplierId = e?.supplierId ?? null;
      form.description = e?.description ?? '';
      form.logoUrl = e?.logoUrl ?? '';
      form.active = e?.active ?? true;
      errors.name = undefined;
      formError.value = '';
    }
  },
);

function onCancel() {
  emit('update:modelValue', false);
}

async function onSubmit() {
  errors.name = undefined;
  formError.value = '';
  if (!form.name.trim()) {
    errors.name = 'Bắt buộc';
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      supplierId: form.supplierId || null,
      description: form.description?.trim() || null,
      logoUrl: form.logoUrl?.trim() || null,
      active: form.active,
    };
    const saved = editingId.value
      ? await updateBrand(editingId.value, payload)
      : await createBrand(payload);
    emit('saved', saved);
    emit('update:modelValue', false);
  } catch (err: any) {
    formError.value = err?.message ?? 'Lưu thất bại';
  } finally {
    saving.value = false;
  }
}
</script>
