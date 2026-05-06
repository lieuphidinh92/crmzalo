<template>
  <div>
    <!-- Discount + summary -->
    <div class="mb-4 summary-block">
      <div class="d-flex justify-space-between align-center mb-2">
        <span class="text-body-2 text-medium-emphasis">Tổng tiền hàng</span>
        <span class="font-mono">{{ formatVND(subtotal) }}</span>
      </div>
      <div class="d-flex align-center mb-2" style="gap: 8px;">
        <span class="text-body-2 text-medium-emphasis flex-grow-1">Chiết khấu</span>
        <v-radio-group
          v-model="discountTypeLocal"
          inline
          density="compact"
          hide-details
          class="d-inline-flex flex-grow-0"
          :disabled="!canEdit"
          @update:model-value="emitDiscount"
        >
          <v-radio label="%" value="percent" />
          <v-radio label="đ" value="fixed" />
        </v-radio-group>
        <v-text-field
          v-model.number="discountValueLocal"
          type="number"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 120px"
          :disabled="!canEdit"
          :suffix="discountTypeLocal === 'percent' ? '%' : 'đ'"
          @update:model-value="emitDiscount"
        />
      </div>
      <div v-if="toNum(discountAmount) > 0" class="d-flex justify-space-between text-error">
        <span class="text-caption">Đã trừ</span>
        <span class="font-mono">- {{ formatVND(discountAmount) }}</span>
      </div>
      <div class="d-flex align-center mb-2" style="gap: 8px;">
        <span class="text-body-2 text-medium-emphasis flex-grow-1">Phí ship</span>
        <v-text-field
          v-model.number="shippingFeeLocal"
          type="number"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px"
          :disabled="!canEdit"
          suffix="đ"
          @update:model-value="emitShipping"
        />
      </div>
      <v-divider class="my-2" />
      <div class="d-flex justify-space-between align-center">
        <span class="text-body-2 font-weight-medium">Tổng phải thu</span>
        <span class="font-mono font-weight-bold text-h6 text-primary">{{ formatVND(total) }}</span>
      </div>
      <div class="d-flex justify-space-between mt-1">
        <span class="text-body-2 text-medium-emphasis">Đã thanh toán</span>
        <span class="font-mono">{{ formatVND(paid) }}</span>
      </div>
      <div class="d-flex justify-space-between font-weight-medium" :class="{ 'text-warning': debt > 0, 'text-success': debt === 0 }">
        <span>Còn nợ</span>
        <span class="font-mono">{{ formatVND(debt) }}</span>
      </div>
      <div v-if="debt > 0 && order.debtDueDate" class="text-right text-caption mt-1" :class="overdue ? 'text-error' : 'text-warning'">
        <v-icon size="14" class="mr-1">mdi-alert-circle</v-icon>
        Hạn nợ: {{ formatDate(order.debtDueDate) }}
        <span v-if="daysToDue !== null">({{ daysToDue >= 0 ? `${daysToDue} ngày nữa` : `quá hạn ${-daysToDue} ngày` }})</span>
      </div>
    </div>

    <!-- Payment form -->
    <div class="payment-form">
      <v-radio-group
        v-model="paymentMethodLocal"
        label="Hình thức TT"
        inline
        :disabled="!canEdit"
        @update:model-value="emitPaymentMethod"
      >
        <v-radio label="Chuyển khoản" value="bank_transfer" />
        <v-radio label="COD" value="cod" />
        <v-radio label="Tiền mặt" value="cash" />
        <v-radio label="Công nợ" value="credit" />
      </v-radio-group>

      <v-row dense>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model.number="paidAmountLocal"
            type="number"
            label="Đã thanh toán (đ)"
            :disabled="!canEdit"
            suffix="đ"
            class="font-mono"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model="debtDueDateLocal"
            type="date"
            label="Hạn thanh toán"
            :hint="paymentMethodLocal === 'credit' ? 'Bắt buộc khi công nợ' : 'Tuỳ chọn'"
            persistent-hint
            :disabled="!canEdit"
            hide-details="auto"
          />
        </v-col>
      </v-row>

      <div class="text-right mt-3" v-if="canEdit">
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-content-save"
          :loading="saving"
          @click="onSavePayment"
        >
          Lưu thanh toán
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { formatVND, toNum, isOverdue, type Order } from '@/composables/use-orders';

const props = defineProps<{
  order: Order;
  canEdit: boolean;
  saving?: boolean;
}>();
const emit = defineEmits<{
  (e: 'updateDiscount', payload: { discountType: string | null; discountValue: number }): void;
  (e: 'updateShipping', shippingFee: number): void;
  (e: 'savePayment', payload: { paidAmount: number; paymentMethod: string; debtDueDate: string | null }): void;
}>();

const discountTypeLocal = ref(props.order.discountType ?? 'percent');
const discountValueLocal = ref(toNum(props.order.discountValue));
const shippingFeeLocal = ref(toNum(props.order.shippingFee));
const paymentMethodLocal = ref(props.order.paymentMethod ?? 'bank_transfer');
const paidAmountLocal = ref(toNum(props.order.paidAmount));
const debtDueDateLocal = ref(props.order.debtDueDate ? props.order.debtDueDate.slice(0, 10) : '');

watch(() => props.order, (o) => {
  discountTypeLocal.value = o.discountType ?? 'percent';
  discountValueLocal.value = toNum(o.discountValue);
  shippingFeeLocal.value = toNum(o.shippingFee);
  paymentMethodLocal.value = o.paymentMethod ?? 'bank_transfer';
  paidAmountLocal.value = toNum(o.paidAmount);
  debtDueDateLocal.value = o.debtDueDate ? o.debtDueDate.slice(0, 10) : '';
}, { deep: true });

const subtotal = computed(() => toNum(props.order.subtotalAmount));
const discountAmount = computed(() => toNum(props.order.discountAmount));
const total = computed(() => toNum(props.order.totalAmountValue ?? props.order.totalAmount));
const paid = computed(() => toNum(props.order.paidAmount));
const debt = computed(() => toNum(props.order.debtAmountValue));
const overdue = computed(() => isOverdue(props.order));
const daysToDue = computed(() => {
  if (!props.order.debtDueDate) return null;
  const ms = new Date(props.order.debtDueDate).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
});

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function emitDiscount() {
  emit('updateDiscount', { discountType: discountTypeLocal.value, discountValue: discountValueLocal.value });
}
function emitShipping() {
  emit('updateShipping', shippingFeeLocal.value);
}
function emitPaymentMethod() {
  // No-op until "Lưu thanh toán" — but we also reflect change in form model only
}

function onSavePayment() {
  emit('savePayment', {
    paidAmount: paidAmountLocal.value,
    paymentMethod: paymentMethodLocal.value,
    debtDueDate: debtDueDateLocal.value || null,
  });
}
</script>

<style scoped>
.summary-block {
  background: rgba(255, 255, 255, 0.03);
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.font-mono :deep(.v-field__input),
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.payment-form {
  margin-top: 12px;
}
</style>
