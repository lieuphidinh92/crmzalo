<template>
  <v-dialog :model-value="modelValue" max-width="520" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ editingId ? 'Sửa NCC' : 'Thêm NCC mới' }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="form.name"
          label="Tên NCC *"
          class="mb-3"
          hide-details="auto"
          :error-messages="errors.name"
          autofocus
        />
        <v-text-field
          v-model="form.country"
          label="Quốc gia"
          placeholder="Pháp / Úc / Anh / Ấn Độ..."
          class="mb-3"
          hide-details
        />
        <v-textarea
          v-model="form.contactInfo"
          label="Thông tin liên hệ"
          rows="3"
          placeholder="Email, điện thoại, địa chỉ, người phụ trách..."
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
        <v-btn color="primary" :loading="saving" @click="onSubmit">Lưu</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useBrands, type Supplier } from '@/composables/use-brands';

const props = defineProps<{
  modelValue: boolean;
  editing: Supplier | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'saved', supplier: Supplier): void;
}>();

const { createSupplier, updateSupplier } = useBrands();
const saving = ref(false);

const editingId = computed(() => props.editing?.id ?? null);

const form = reactive({
  name: '',
  country: '',
  contactInfo: '',
  active: true,
});
const errors = reactive<{ name?: string }>({});
const formError = ref('');

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      const e = props.editing;
      form.name = e?.name ?? '';
      form.country = e?.country ?? '';
      form.contactInfo = e?.contactInfo ?? '';
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
      country: form.country?.trim() || null,
      contactInfo: form.contactInfo?.trim() || null,
      active: form.active,
    };
    const saved = editingId.value
      ? await updateSupplier(editingId.value, payload)
      : await createSupplier(payload);
    emit('saved', saved);
    emit('update:modelValue', false);
  } catch (err: any) {
    formError.value = err?.message ?? 'Lưu thất bại';
  } finally {
    saving.value = false;
  }
}
</script>
