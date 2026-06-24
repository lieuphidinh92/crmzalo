<template>
  <v-dialog :model-value="modelValue" max-width="640" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ editingId ? 'Sửa NCC' : 'Thêm NCC mới' }}</v-card-title>
      <v-card-text>
        <!-- ── Thông tin chung ───────────────────────────────── -->
        <div class="section-label">Thông tin chung</div>
        <v-row dense>
          <v-col cols="12" sm="7">
            <v-text-field
              v-model="form.name"
              label="Tên NCC *"
              hide-details="auto"
              :error-messages="errors.name"
              autofocus
            />
          </v-col>
          <v-col cols="12" sm="5">
            <v-text-field
              v-model="form.country"
              label="Quốc gia"
              placeholder="Pháp / Úc / Anh / Ấn Độ..."
              hide-details
            />
          </v-col>
        </v-row>
        <v-textarea
          v-model="form.contactInfo"
          label="Thông tin liên hệ (tự do)"
          rows="2"
          placeholder="Người phụ trách, ghi chú liên hệ..."
          class="mt-3"
          hide-details
        />

        <!-- ── Liên hệ ───────────────────────────────────────── -->
        <div class="section-label mt-5">Liên hệ</div>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.email" label="Email" hide-details />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.phone" label="Số điện thoại" hide-details />
          </v-col>
          <v-col cols="12">
            <v-text-field v-model="form.address" label="Địa chỉ" hide-details />
          </v-col>
        </v-row>

        <!-- ── Thanh toán & ngân hàng ────────────────────────── -->
        <div class="section-label mt-5">Thanh toán &amp; ngân hàng</div>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model.number="form.paymentTermDays"
              label="Hạn thanh toán (ngày)"
              type="number"
              min="0"
              hint="Số ngày được nợ kể từ ngày nhập. Mặc định 30."
              persistent-hint
              :error-messages="errors.paymentTermDays"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.taxCode" label="Mã số thuế" hide-details />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.bankName" label="Ngân hàng" hide-details />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.bankAccount" label="Số tài khoản" hide-details />
          </v-col>
          <v-col cols="12">
            <v-text-field v-model="form.bankHolder" label="Chủ tài khoản" hide-details />
          </v-col>
        </v-row>

        <!-- ── Khác ──────────────────────────────────────────── -->
        <v-textarea
          v-model="form.notes"
          label="Ghi chú nội bộ"
          rows="2"
          class="mt-5"
          hide-details
        />
        <v-switch
          v-model="form.active"
          label="Đang hoạt động"
          color="success"
          class="mt-2"
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
  email: '',
  phone: '',
  address: '',
  paymentTermDays: 30 as number | null,
  taxCode: '',
  bankName: '',
  bankAccount: '',
  bankHolder: '',
  notes: '',
  active: true,
});
const errors = reactive<{ name?: string; paymentTermDays?: string }>({});
const formError = ref('');

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      const e = props.editing;
      form.name = e?.name ?? '';
      form.country = e?.country ?? '';
      form.contactInfo = e?.contactInfo ?? '';
      form.email = e?.email ?? '';
      form.phone = e?.phone ?? '';
      form.address = e?.address ?? '';
      form.paymentTermDays = e?.paymentTermDays ?? 30;
      form.taxCode = e?.taxCode ?? '';
      form.bankName = e?.bankName ?? '';
      form.bankAccount = e?.bankAccount ?? '';
      form.bankHolder = e?.bankHolder ?? '';
      form.notes = e?.notes ?? '';
      form.active = e?.active ?? true;
      errors.name = undefined;
      errors.paymentTermDays = undefined;
      formError.value = '';
    }
  },
);

function onCancel() {
  emit('update:modelValue', false);
}

function trimOrNull(v: string): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

async function onSubmit() {
  errors.name = undefined;
  errors.paymentTermDays = undefined;
  formError.value = '';

  if (!form.name.trim()) {
    errors.name = 'Bắt buộc';
    return;
  }
  const term = form.paymentTermDays;
  if (term != null && (typeof term !== 'number' || !Number.isFinite(term) || term < 0)) {
    errors.paymentTermDays = 'Phải là số ngày >= 0';
    return;
  }

  saving.value = true;
  try {
    const payload: Partial<Supplier> = {
      name: form.name.trim(),
      country: trimOrNull(form.country),
      contactInfo: trimOrNull(form.contactInfo),
      email: trimOrNull(form.email),
      phone: trimOrNull(form.phone),
      address: trimOrNull(form.address),
      paymentTermDays: term == null ? 30 : term,
      taxCode: trimOrNull(form.taxCode),
      bankName: trimOrNull(form.bankName),
      bankAccount: trimOrNull(form.bankAccount),
      bankHolder: trimOrNull(form.bankHolder),
      notes: trimOrNull(form.notes),
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

<style scoped>
.section-label {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
  margin-bottom: 4px;
}
</style>
