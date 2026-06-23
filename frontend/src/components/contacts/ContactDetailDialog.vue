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
        <v-alert
          v-if="lastSaveError"
          type="error"
          variant="tonal"
          density="comfortable"
          class="mb-3"
          closable
          @click:close="lastSaveError = null"
        >
          {{ lastSaveError }}
        </v-alert>

        <v-tabs v-model="activeTab" density="compact" color="primary" class="mb-3">
          <v-tab value="main">Thông tin chính</v-tab>
          <v-tab value="dates">Sinh nhật & ngày đặc biệt</v-tab>
          <v-tab v-if="!isNew" value="care">Lịch sử chăm sóc</v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
        <v-window-item value="main">
        <v-row dense>
          <!-- Identity --------------------------------------------------- -->
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.fullName" label="Họ và tên" :rules="[required]" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.phone"
              label="Số điện thoại (Zalo)"
              hint="10 số bắt đầu 0. Hệ thống tự chuẩn hoá +84… hoặc thiếu 0."
              persistent-hint
            />
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
        </v-window-item>

        <!-- PR2: Tab sinh nhật + ngày đặc biệt -->
        <v-window-item value="dates">
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.birthday"
                type="date"
                label="Ngày sinh"
                hint="Hiện badge bánh kem khi sinh nhật trong 30 ngày tới"
                persistent-hint
              />
            </v-col>
            <v-col cols="12">
              <div class="text-subtitle-2 mb-2">Ngày đặc biệt khác</div>
              <div class="text-caption text-medium-emphasis mb-2">
                Ví dụ: ngày khai trương cửa hàng, kỷ niệm cưới, ngày làm việc đầu tiên…
              </div>
              <div
                v-for="(sd, idx) in form.specialDates"
                :key="idx"
                class="d-flex gap-2 mb-2 align-center"
              >
                <v-text-field
                  v-model="sd.label"
                  placeholder="Sự kiện"
                  density="compact"
                  hide-details
                  class="flex-grow-1"
                />
                <v-text-field
                  v-model="sd.date"
                  type="date"
                  density="compact"
                  hide-details
                  style="max-width: 180px"
                />
                <v-btn
                  icon="mdi-delete"
                  size="small"
                  variant="text"
                  color="error"
                  @click="form.specialDates.splice(idx, 1)"
                />
              </div>
              <v-btn
                prepend-icon="mdi-plus"
                variant="tonal"
                size="small"
                @click="form.specialDates.push({ label: '', date: '' })"
              >
                Thêm ngày đặc biệt
              </v-btn>
            </v-col>
          </v-row>
        </v-window-item>

        <!-- PR2: Tab lịch sử chăm sóc -->
        <v-window-item v-if="!isNew" value="care">
          <v-row dense>
            <v-col cols="12">
              <div class="text-subtitle-2 mb-2">Ghi nhận chăm sóc mới</div>
              <div class="d-flex gap-2 mb-3 align-start flex-wrap">
                <v-select
                  v-model="newCare.type"
                  :items="CARE_TYPE_OPTIONS"
                  item-title="text"
                  item-value="value"
                  label="Loại"
                  density="compact"
                  hide-details
                  style="max-width: 160px"
                />
                <v-text-field
                  v-model="newCare.careAt"
                  type="datetime-local"
                  label="Thời điểm"
                  density="compact"
                  hide-details
                  style="max-width: 220px"
                />
                <v-text-field
                  v-model="newCare.note"
                  label="Ghi chú"
                  density="compact"
                  hide-details
                  class="flex-grow-1"
                  style="min-width: 200px"
                />
                <v-btn
                  color="primary"
                  variant="flat"
                  :loading="careSaving"
                  :disabled="!newCare.note && !newCare.type"
                  @click="submitCareLog"
                >
                  Lưu
                </v-btn>
              </div>
              <v-alert
                v-if="careError"
                type="error"
                variant="tonal"
                density="compact"
                class="mb-2"
              >
                {{ careError }}
              </v-alert>
            </v-col>

            <v-col cols="12">
              <div class="text-subtitle-2 mb-2">
                {{ careLogs.length }} lần chăm sóc
              </div>
              <div v-if="careLoading" class="text-caption text-medium-emphasis">Đang tải…</div>
              <div v-else-if="!careLogs.length" class="text-caption text-medium-emphasis">
                Chưa có ghi nhận chăm sóc nào.
              </div>
              <v-list v-else density="compact">
                <v-list-item
                  v-for="log in careLogs"
                  :key="log.id"
                  class="border-b pa-2"
                >
                  <template #prepend>
                    <v-icon :color="careTypeColor(log.type)">{{ careTypeIcon(log.type) }}</v-icon>
                  </template>
                  <v-list-item-title class="text-body-2">
                    <strong>{{ careTypeLabel(log.type) }}</strong>
                    · {{ formatCareAt(log.careAt) }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption">
                    {{ log.note || '(không ghi chú)' }}
                    <span class="text-medium-emphasis">— {{ log.createdBy?.fullName ?? '?' }}</span>
                  </v-list-item-subtitle>
                  <template #append>
                    <v-btn
                      icon="mdi-delete"
                      size="x-small"
                      variant="text"
                      color="error"
                      @click="removeCareLog(log.id)"
                    />
                  </template>
                </v-list-item>
              </v-list>
            </v-col>
          </v-row>
        </v-window-item>
        </v-window>
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
import { api } from '@/api/index';

const props = defineProps<{
  modelValue: boolean;
  contact: Contact | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [contact: Contact];
  deleted: [id: string];
}>();

const { saving, deleting, lastSaveError, createContact, updateContact, deleteContact } = useContacts();

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
  // PR2 fields
  birthday: string;
  specialDates: Array<{ label: string; date: string }>;
}

const activeTab = ref<'main' | 'dates' | 'care'>('main');

const CARE_TYPE_OPTIONS = [
  { value: 'call', text: 'Gọi điện' },
  { value: 'zalo', text: 'Zalo' },
  { value: 'visit', text: 'Gặp mặt' },
  { value: 'sms', text: 'SMS' },
  { value: 'other', text: 'Khác' },
];

function careTypeLabel(v: string): string {
  return CARE_TYPE_OPTIONS.find(o => o.value === v)?.text ?? v;
}
function careTypeColor(v: string): string {
  const m: Record<string, string> = {
    call: 'success',
    zalo: 'info',
    visit: 'warning',
    sms: 'secondary',
    other: 'grey',
  };
  return m[v] ?? 'grey';
}
function careTypeIcon(v: string): string {
  const m: Record<string, string> = {
    call: 'mdi-phone',
    zalo: 'mdi-chat-processing',
    visit: 'mdi-handshake',
    sms: 'mdi-message-text',
    other: 'mdi-note-text',
  };
  return m[v] ?? 'mdi-note-text';
}
function formatCareAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface CareLog {
  id: string;
  type: string;
  note: string | null;
  careAt: string;
  createdBy?: { id: string; fullName: string } | null;
}
const careLogs = ref<CareLog[]>([]);
const careLoading = ref(false);
const careSaving = ref(false);
const careError = ref<string | null>(null);
const newCare = ref<{ type: string; note: string; careAt: string }>({
  type: 'call',
  note: '',
  careAt: new Date().toISOString().slice(0, 16),
});

async function loadCareLogs(contactId: string) {
  careLoading.value = true;
  careError.value = null;
  try {
    const res = await api.get(`/contacts/${contactId}/care-logs`);
    careLogs.value = res.data.careLogs ?? [];
  } catch (err) {
    console.error('Failed to fetch care logs:', err);
    careError.value = 'Không tải được lịch sử chăm sóc';
  } finally {
    careLoading.value = false;
  }
}

async function submitCareLog() {
  if (!props.contact?.id) return;
  careSaving.value = true;
  careError.value = null;
  try {
    const res = await api.post(`/contacts/${props.contact.id}/care-logs`, {
      type: newCare.value.type,
      note: newCare.value.note,
      careAt: new Date(newCare.value.careAt).toISOString(),
    });
    careLogs.value.unshift(res.data);
    newCare.value = {
      type: 'call',
      note: '',
      careAt: new Date().toISOString().slice(0, 16),
    };
  } catch (err: any) {
    careError.value = err?.response?.data?.error ?? 'Lưu thất bại';
  } finally {
    careSaving.value = false;
  }
}

async function removeCareLog(logId: string) {
  if (!props.contact?.id) return;
  try {
    await api.delete(`/contacts/${props.contact.id}/care-logs/${logId}`);
    careLogs.value = careLogs.value.filter(l => l.id !== logId);
  } catch (err: any) {
    careError.value = err?.response?.data?.error ?? 'Xoá thất bại';
  }
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
    birthday: '',
    specialDates: [],
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
        birthday: dateToInput(c.birthday),
        specialDates: Array.isArray(c.specialDates)
          ? c.specialDates.map(d => ({ label: d.label, date: d.date }))
          : [],
      };
      // PR2: lazy-load care logs when an existing contact opens
      if (c.id) loadCareLogs(c.id);
      else careLogs.value = [];
    } else {
      form.value = emptyForm();
      careLogs.value = [];
    }
    activeTab.value = 'main';
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
    birthday: form.value.birthday ? inputToIso(form.value.birthday) : null,
    specialDates: form.value.specialDates.filter(d => d.label && d.date),
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
