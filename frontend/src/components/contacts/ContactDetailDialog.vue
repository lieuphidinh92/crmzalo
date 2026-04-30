<template>
  <v-dialog v-model="show" max-width="780" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>{{ isNew ? 'Thêm khách hàng' : 'Chi tiết khách hàng' }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-row dense>
          <!-- Identity --------------------------------------------------- -->
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.fullName" label="Họ và tên" :rules="[required]" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.phone" label="Số điện thoại (Zalo)" />
          </v-col>

          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.storeName"
              label="Tên cửa hàng / nhà thuốc / fanpage"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.province" label="Tỉnh thành" />
          </v-col>

          <!-- B2B classification ---------------------------------------- -->
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.customerType"
              :items="CUSTOMER_TYPE_OPTIONS"
              item-title="text"
              item-value="value"
              label="Loại khách hàng"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.scale"
              :items="SCALE_OPTIONS"
              item-title="text"
              item-value="value"
              label="Quy mô"
              clearable
            />
          </v-col>

          <v-col cols="12" sm="6">
            <v-select
              v-model="form.stage"
              :items="STAGE_OPTIONS"
              item-title="text"
              item-value="value"
              label="Stage hợp tác"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.policyTier"
              :items="POLICY_TIER_OPTIONS"
              item-title="text"
              item-value="value"
              label="Chính sách"
              clearable
            />
          </v-col>

          <!-- Business details ------------------------------------------ -->
          <v-col cols="12">
            <v-combobox
              v-model="form.currentProducts"
              label="Sản phẩm đang bán"
              multiple
              chips
              closable-chips
              clearable
              hint="Gõ tên sản phẩm và Enter để thêm"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.currentSupplier"
              label="Đang lấy hàng từ"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.monthlyRevenueEstimate"
              label="Doanh số ước tính/tháng"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.avgOrderQuantity"
              label="Số lượng đặt trung bình"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.debtAmount"
              label="Công nợ (VND)"
              type="number"
              min="0"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.potentialValue"
              label="Giá trị deal tiềm năng (VND)"
              type="number"
              min="0"
              prepend-inner-icon="mdi-cash-multiple"
              hint="Hiển thị trên Pipeline cơ hội"
              persistent-hint
            />
          </v-col>

          <!-- Tracking --------------------------------------------------- -->
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.source"
              :items="SOURCE_OPTIONS"
              item-title="text"
              item-value="value"
              label="Nguồn"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.firstContactDate"
              label="Ngày tiếp nhận"
              type="date"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.nextContactDate"
              label="Liên hệ tiếp theo"
              type="date"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.lastOrderDate"
              label="Đơn gần nhất"
              type="date"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.rewardPoints"
              label="Điểm thưởng"
              type="number"
              min="0"
            />
          </v-col>

          <v-col cols="12">
            <v-textarea
              v-model="form.stuckReason"
              label="Lý do chưa chốt"
              rows="2"
              auto-grow
            />
          </v-col>

          <!-- Tags + notes ----------------------------------------------- -->
          <v-col cols="12">
            <v-combobox
              v-model="form.tags"
              label="Tags"
              multiple
              chips
              closable-chips
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12">
            <v-textarea v-model="form.notes" label="Ghi chú" rows="2" auto-grow />
          </v-col>
          <v-col cols="12">
            <v-textarea
              v-model="form.internalNote"
              label="Ghi chú nội bộ (không cho khách thấy)"
              rows="2"
              auto-grow
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn
          v-if="!isNew"
          color="error"
          variant="text"
          :loading="deleting"
          @click="onDelete"
        >
          Xoá
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">Huỷ</v-btn>
        <v-btn color="primary" :loading="saving" @click="onSave">Lưu</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Contact } from '@/composables/use-contacts';
import {
  SOURCE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  STAGE_OPTIONS,
  SCALE_OPTIONS,
  POLICY_TIER_OPTIONS,
  useContacts,
} from '@/composables/use-contacts';

const props = defineProps<{
  modelValue: boolean;
  contact: Contact | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [contact: Contact];
  deleted: [id: string];
}>();

const { saving, deleting, createContact, updateContact, deleteContact } = useContacts();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isNew = computed(() => !props.contact?.id);

interface FormState {
  fullName: string;
  phone: string;
  storeName: string;
  province: string;
  customerType: string;
  scale: string;
  stage: string;
  policyTier: string;
  currentProducts: string[];
  currentSupplier: string;
  monthlyRevenueEstimate: string;
  avgOrderQuantity: string;
  debtAmount: string;
  potentialValue: string;
  rewardPoints: string;
  source: string;
  firstContactDate: string;
  nextContactDate: string;
  lastOrderDate: string;
  stuckReason: string;
  notes: string;
  internalNote: string;
  tags: string[];
}

const form = ref<FormState>(emptyForm());

function emptyForm(): FormState {
  return {
    fullName: '',
    phone: '',
    storeName: '',
    province: '',
    customerType: '',
    scale: '',
    stage: '',
    policyTier: '',
    currentProducts: [],
    currentSupplier: '',
    monthlyRevenueEstimate: '',
    avgOrderQuantity: '',
    debtAmount: '',
    potentialValue: '',
    rewardPoints: '0',
    source: '',
    firstContactDate: '',
    nextContactDate: '',
    lastOrderDate: '',
    stuckReason: '',
    notes: '',
    internalNote: '',
    tags: [],
  };
}

function dateToInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
}

function inputToIso(d: string): string | null {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toISOString();
}

watch(
  () => props.contact,
  (c) => {
    if (c) {
      form.value = {
        fullName: c.fullName ?? '',
        phone: c.phone ?? '',
        storeName: c.storeName ?? '',
        province: c.province ?? '',
        customerType: c.customerType ?? '',
        scale: c.scale ?? '',
        stage: c.stage ?? '',
        policyTier: c.policyTier ?? '',
        currentProducts: Array.isArray(c.currentProducts) ? [...c.currentProducts] : [],
        currentSupplier: c.currentSupplier ?? '',
        monthlyRevenueEstimate: c.monthlyRevenueEstimate ?? '',
        avgOrderQuantity: c.avgOrderQuantity ?? '',
        debtAmount: c.debtAmount != null ? String(c.debtAmount) : '',
        potentialValue: c.potentialValue != null ? String(c.potentialValue) : '',
        rewardPoints: c.rewardPoints != null ? String(c.rewardPoints) : '0',
        source: c.source ?? '',
        firstContactDate: dateToInput(c.firstContactDate),
        nextContactDate: dateToInput(c.nextContactDate),
        lastOrderDate: dateToInput(c.lastOrderDate),
        stuckReason: c.stuckReason ?? '',
        notes: c.notes ?? '',
        internalNote: c.internalNote ?? '',
        tags: Array.isArray(c.tags) ? [...c.tags] : [],
      };
    } else {
      form.value = emptyForm();
    }
  },
  { immediate: true, deep: true },
);

function required(v: string) {
  return !!v || 'Bắt buộc';
}

async function onSave() {
  const payload: Partial<Contact> = {
    fullName: form.value.fullName || null,
    phone: form.value.phone || null,
    storeName: form.value.storeName || null,
    province: form.value.province || null,
    customerType: form.value.customerType || null,
    scale: form.value.scale || null,
    stage: form.value.stage || null,
    policyTier: form.value.policyTier || null,
    currentProducts: form.value.currentProducts,
    currentSupplier: form.value.currentSupplier || null,
    monthlyRevenueEstimate: form.value.monthlyRevenueEstimate || null,
    avgOrderQuantity: form.value.avgOrderQuantity || null,
    debtAmount: form.value.debtAmount ? Number(form.value.debtAmount) : null,
    potentialValue: form.value.potentialValue ? Number(form.value.potentialValue) : null,
    rewardPoints: form.value.rewardPoints ? Number(form.value.rewardPoints) : 0,
    source: form.value.source || null,
    firstContactDate: inputToIso(form.value.firstContactDate),
    nextContactDate: inputToIso(form.value.nextContactDate),
    lastOrderDate: inputToIso(form.value.lastOrderDate),
    stuckReason: form.value.stuckReason || null,
    notes: form.value.notes || null,
    internalNote: form.value.internalNote || null,
    tags: form.value.tags,
  };

  let result: Contact | null;
  if (isNew.value) {
    result = await createContact(payload);
  } else {
    result = await updateContact(props.contact!.id, payload);
  }
  if (result) {
    emit('saved', result);
    close();
  }
}

async function onDelete() {
  if (!props.contact?.id) return;
  const ok = await deleteContact(props.contact.id);
  if (ok) {
    emit('deleted', props.contact.id);
    close();
  }
}

function close() {
  emit('update:modelValue', false);
}
</script>
