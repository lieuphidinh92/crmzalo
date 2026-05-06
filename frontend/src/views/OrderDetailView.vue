<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-3 flex-wrap gap-2">
      <v-btn icon variant="text" size="small" @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <h1 class="text-h6 mb-0">
          {{ isNew ? 'Tạo đơn mới' : (order?.orderCode ?? 'Chi tiết đơn') }}
        </h1>
        <div v-if="order" class="text-caption text-medium-emphasis">
          Tạo ngày {{ formatDate(order.createdAt) }}
          <span v-if="order.createdBy"> bởi {{ order.createdBy.fullName }}</span>
        </div>
      </div>
      <v-spacer />
      <v-btn
        v-if="canEditOrder && hasUnsavedHeader"
        color="primary"
        prepend-icon="mdi-content-save"
        :loading="saving"
        @click="saveHeader"
      >
        Lưu thay đổi
      </v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <template v-if="order && !isNew">
      <!-- Section 1: Pipeline -->
      <PipelineStatusBar
        :current="order.statusNormalized"
        :can-edit="canAdvance"
        :cancel-reason="order.cancelReason"
        :busy="advancing"
        @advance="onAdvance"
        @cancel="cancelDialog = true"
      />
    </template>

    <v-row class="mt-3" dense>
      <v-col cols="12" md="8">
        <!-- Section 2: Khách hàng -->
        <v-card variant="flat" rounded="xl" class="pa-4 mb-3">
          <div class="section-header mb-3">
            <v-icon size="14" class="mr-1">mdi-account</v-icon>
            Khách hàng
          </div>
          <OrderContactPicker
            v-model="contactPicked"
            :disabled="!canEditOrder || !isNew"
            @update:model-value="onContactPicked"
          />
          <v-row v-if="contactPicked" dense class="mt-3">
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.assignedSaleId"
                :items="saleOptions"
                item-title="text"
                item-value="value"
                label="Sale phụ trách"
                :disabled="!canEditOrder"
                hide-details
                @update:model-value="markDirty"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.orderDate"
                type="date"
                label="Ngày đặt"
                :disabled="!canEditOrder"
                hide-details
                @update:model-value="markDirty"
              />
            </v-col>
          </v-row>
        </v-card>

        <!-- Section 3: Marketing tracking -->
        <v-card variant="flat" rounded="xl" class="pa-4 mb-3">
          <div class="section-header mb-3">
            <v-icon size="14" class="mr-1">mdi-bullhorn</v-icon>
            Marketing tracking
          </div>
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.source"
                :items="sourceOptions"
                item-title="text"
                item-value="value"
                label="Nguồn đơn"
                :disabled="!canEditOrder"
                hide-details
                @update:model-value="markDirty"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.mktOwnerId"
                :items="mktOptions"
                item-title="text"
                item-value="value"
                label="NV Marketing phụ trách"
                clearable
                :disabled="!canEditOrder"
                hide-details
                @update:model-value="markDirty"
              />
            </v-col>
          </v-row>
        </v-card>

        <!-- Section 4: Sản phẩm -->
        <v-card variant="flat" rounded="xl" class="pa-4 mb-3">
          <div class="d-flex align-center mb-3">
            <v-icon size="14" class="mr-1" color="primary">mdi-cart-outline</v-icon>
            <span class="section-header">Sản phẩm</span>
            <v-spacer />
            <v-btn
              v-if="!isNew && canEditOrder"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-plus"
              size="small"
              @click="productDialog = true"
            >
              Thêm SP
            </v-btn>
          </div>

          <v-alert
            v-if="isNew"
            type="info"
            variant="tonal"
            density="compact"
          >
            Chọn KH và lưu nháp trước, sau đó có thể thêm sản phẩm.
          </v-alert>

          <div v-else-if="order && order.items?.length === 0" class="text-center py-6 empty-block">
            <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-cart-off</v-icon>
            <div class="text-body-2 text-medium-emphasis">Chưa có sản phẩm</div>
          </div>

          <div v-else class="items-list">
            <div
              v-for="item in order?.items ?? []"
              :key="item.id"
              class="item-row"
            >
              <v-img
                v-if="item.product?.mainImageUrl"
                :src="item.product.mainImageUrl"
                width="48"
                height="48"
                cover
                class="rounded item-thumb"
              />
              <div v-else class="item-thumb item-thumb--empty d-flex align-center justify-center">
                <v-icon size="20" color="grey">mdi-package</v-icon>
              </div>
              <div class="item-info">
                <div class="font-weight-medium">{{ item.productName }}</div>
                <div class="text-caption text-medium-emphasis font-mono">
                  {{ item.sku }}
                  <span v-if="item.batch"> · Lô {{ item.batch.batchCode }}</span>
                </div>
              </div>
              <div class="item-qty font-mono">
                {{ item.quantity }} × {{ formatVND(item.unitPrice) }}
              </div>
              <v-chip v-if="item.tier" size="x-small" variant="tonal" color="primary">
                {{ item.tier.tierName }}
              </v-chip>
              <div v-if="canSeeCost && item.profit !== null" class="item-profit text-caption">
                LN: <span :class="Number(item.profit) > 0 ? 'text-success' : 'text-error'">{{ formatVND(item.profit) }}</span>
              </div>
              <div class="item-total font-mono font-weight-medium">{{ formatVND(item.lineTotal) }}</div>
              <v-btn
                v-if="canEditOrder"
                icon
                size="x-small"
                variant="text"
                color="error"
                @click="removeItem(item.id)"
              >
                <v-icon size="16">mdi-close</v-icon>
              </v-btn>
            </div>
          </div>

          <!-- Section 4b: Quà tặng -->
          <v-divider v-if="order && (order.gifts?.length ?? 0) > 0" class="my-3" />
          <div v-if="order && (order.gifts?.length ?? 0) > 0" class="mb-2 text-body-2">
            <v-icon size="14" class="mr-1">mdi-gift-outline</v-icon>
            Quà tặng kèm
          </div>
          <div
            v-for="g in order?.gifts ?? []"
            :key="g.id"
            class="gift-row"
          >
            <v-icon size="18" color="primary">mdi-gift</v-icon>
            <div class="flex-grow-1">
              <div class="font-weight-medium">{{ g.giftName }}</div>
              <div v-if="g.batch" class="text-caption text-medium-emphasis">Lô {{ g.batch.batchCode }} · Trừ kho khi đóng gói</div>
              <div v-else class="text-caption text-medium-emphasis">Quà custom — không trừ kho</div>
            </div>
            <div>x{{ g.quantity }}</div>
            <v-chip color="success" variant="tonal" size="x-small">FREE</v-chip>
            <v-btn
              v-if="canEditOrder"
              icon
              size="x-small"
              variant="text"
              color="error"
              @click="removeGift(g.id)"
            >
              <v-icon size="16">mdi-close</v-icon>
            </v-btn>
          </div>

          <div v-if="!isNew && canEditOrder" class="mt-3">
            <v-btn
              variant="text"
              color="primary"
              prepend-icon="mdi-plus"
              @click="productDialog = true"
            >
              Thêm SP
            </v-btn>
            <v-btn
              variant="text"
              prepend-icon="mdi-gift-outline"
              @click="giftDialog = true"
            >
              Thêm quà tặng
            </v-btn>
          </div>
        </v-card>

        <!-- Section 5: Vận chuyển -->
        <v-card variant="flat" rounded="xl" class="pa-4 mb-3">
          <div class="section-header mb-3">
            <v-icon size="14" class="mr-1">mdi-truck-outline</v-icon>
            Vận chuyển
          </div>
          <v-radio-group
            v-model="form.shippingMethod"
            :disabled="!canEditOrder"
            inline
            hide-details
            class="mb-3"
            @update:model-value="markDirty"
          >
            <v-radio label="KH tự lấy tại kho" value="pickup_at_warehouse" />
            <v-radio label="Ship COD" value="cod" />
            <v-radio label="Ship trả trước" value="prepaid" />
          </v-radio-group>

          <v-row v-if="form.shippingMethod !== 'pickup_at_warehouse'" dense>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.shippingProvider"
                :items="shippingProviderOptions"
                item-title="text"
                item-value="value"
                label="Đơn vị VC"
                clearable
                :disabled="!canEditOrder"
                hide-details
                @update:model-value="markDirty"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.trackingCode"
                label="Mã vận đơn"
                placeholder="GHTK123456..."
                class="font-mono"
                :disabled="!canEditOrder"
                hide-details
                @update:model-value="markDirty"
              />
            </v-col>
          </v-row>
          <v-textarea
            v-model="form.deliveryAddress"
            label="Địa chỉ giao"
            rows="2"
            class="mt-3"
            :disabled="!canEditOrder"
            hide-details
            @update:model-value="markDirty"
          />
        </v-card>

        <!-- Section 6: Thanh toán -->
        <v-card v-if="!isNew && order" variant="flat" rounded="xl" class="pa-4 mb-3">
          <div class="section-header mb-3">
            <v-icon size="14" class="mr-1">mdi-cash-multiple</v-icon>
            Thanh toán
          </div>
          <OrderPaymentSection
            :order="order"
            :can-edit="canEditOrder"
            :saving="paymentSaving"
            @update-discount="onUpdateDiscount"
            @update-shipping="onUpdateShipping"
            @save-payment="onSavePayment"
          />
        </v-card>

        <!-- Section 7: Ghi chú -->
        <v-card variant="flat" rounded="xl" class="pa-4 mb-3">
          <div class="section-header mb-3">
            <v-icon size="14" class="mr-1">mdi-note-edit-outline</v-icon>
            Ghi chú
          </div>
          <v-textarea
            v-model="form.internalNote"
            label="Ghi chú nội bộ (chỉ team thấy)"
            rows="2"
            :disabled="!canEditOrder"
            class="mb-3"
            hide-details
            @update:model-value="markDirty"
          />
          <v-textarea
            v-model="form.customerNote"
            label="Ghi chú cho KH (in trên phiếu giao)"
            rows="2"
            :disabled="!canEditOrder"
            hide-details
            @update:model-value="markDirty"
          />
        </v-card>
      </v-col>

      <!-- RIGHT SIDEBAR -->
      <v-col cols="12" md="4">
        <!-- Tổng quan -->
        <v-card v-if="!isNew && order" variant="flat" rounded="xl" class="pa-4 mb-3 sticky-card">
          <div class="section-header mb-3">
            <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
            Tổng quan
          </div>
          <div class="d-flex justify-space-between mb-2">
            <span class="text-caption text-medium-emphasis">Tổng tiền</span>
            <span class="font-mono font-weight-bold text-primary">
              {{ formatVND(order.totalAmountValue ?? order.totalAmount) }}
            </span>
          </div>
          <div class="d-flex justify-space-between mb-2">
            <span class="text-caption text-medium-emphasis">Số lượng SP</span>
            <span class="font-mono">{{ totalQuantity }}</span>
          </div>
          <div v-if="canSeeCost && totalProfit !== null" class="d-flex justify-space-between mb-2">
            <span class="text-caption text-medium-emphasis">Lợi nhuận</span>
            <span class="font-mono" :class="totalProfit > 0 ? 'text-success' : 'text-error'">
              {{ formatVND(totalProfit) }}
            </span>
          </div>
        </v-card>

        <!-- Section 8: Hoá đơn placeholder -->
        <OrderInvoiceCard v-if="!isNew && order" :order-id="order.id" @print="onPrint" />
      </v-col>
    </v-row>

    <!-- Product picker dialog -->
    <OrderProductPickerDialog
      v-if="!isNew && order"
      v-model="productDialog"
      :contact-policy-tier="order.contact?.policyTier ?? null"
      @add="onAddItem"
    />

    <!-- Gift dialog -->
    <OrderGiftDialog v-model="giftDialog" @add="onAddGift" />

    <!-- Save draft button (for new order) -->
    <v-btn
      v-if="isNew"
      color="primary"
      prepend-icon="mdi-content-save"
      block
      size="large"
      class="mt-4"
      :loading="saving"
      :disabled="!contactPicked"
      @click="createDraft"
    >
      Lưu nháp đơn
    </v-btn>

    <!-- Cancel dialog -->
    <v-dialog v-model="cancelDialog" max-width="420">
      <v-card>
        <v-card-title>Huỷ đơn?</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="cancelReason"
            label="Lý do huỷ *"
            rows="3"
            autofocus
            hide-details="auto"
            :error-messages="!cancelReason && cancelTried ? 'Bắt buộc' : ''"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelDialog = false">Bỏ qua</v-btn>
          <v-btn color="error" :loading="advancing" @click="onCancelOrder">Huỷ đơn</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Tracking dialog (for shipping transition) -->
    <v-dialog v-model="trackingDialog" max-width="420" persistent>
      <v-card>
        <v-card-title>Cập nhật mã vận đơn</v-card-title>
        <v-card-text>
          <v-select
            v-model="trackingForm.provider"
            :items="shippingProviderOptions"
            item-title="text"
            item-value="value"
            label="Đơn vị VC"
            class="mb-3"
            hide-details
          />
          <v-text-field
            v-model="trackingForm.code"
            label="Mã vận đơn *"
            placeholder="GHTK123456..."
            class="font-mono"
            hide-details="auto"
            :error-messages="trackingForm.code ? '' : 'Bắt buộc'"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="trackingDialog = false">Huỷ</v-btn>
          <v-btn
            color="primary"
            :loading="advancing"
            :disabled="!trackingForm.code"
            @click="onConfirmShipping"
          >
            Chuyển sang Đang giao
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delivery note preview dialog with print action -->
    <v-dialog v-model="previewPrint" fullscreen scrollable>
      <v-card>
        <v-toolbar density="compact" color="surface" flat class="print-toolbar">
          <v-btn icon variant="text" @click="closePrintPreview">
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-toolbar-title>Xem trước phiếu giao — {{ order?.orderCode }}</v-toolbar-title>
          <v-spacer />
          <v-btn color="primary" prepend-icon="mdi-printer" @click="doPrint">
            In / Lưu PDF
          </v-btn>
        </v-toolbar>
        <v-card-text class="pa-0 print-host">
          <OrderDeliveryNote v-if="order" :order="order" :print-mode="true" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="3500">
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  useOrders,
  ORDER_SOURCE_OPTIONS,
  SHIPPING_PROVIDER_OPTIONS,
  formatVND,
  toNum,
  type Order,
  type OrderStatus,
} from '@/composables/use-orders';
import { useUsers } from '@/composables/use-users';
import PipelineStatusBar from '@/components/orders/PipelineStatusBar.vue';
import OrderContactPicker from '@/components/orders/OrderContactPicker.vue';
import OrderProductPickerDialog from '@/components/orders/OrderProductPickerDialog.vue';
import OrderGiftDialog from '@/components/orders/OrderGiftDialog.vue';
import OrderPaymentSection from '@/components/orders/OrderPaymentSection.vue';
import OrderInvoiceCard from '@/components/orders/OrderInvoiceCard.vue';
import OrderDeliveryNote from '@/components/orders/OrderDeliveryNote.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const isNew = computed(() => route.params.id === 'new' || !route.params.id);
const orderId = ref<string | null>(isNew.value ? null : (route.params.id as string));

const isAdmin = computed(() => {
  const r = authStore.user?.role ?? '';
  return r === 'owner' || r === 'admin';
});
const canSeeCost = computed(() => isAdmin.value);

const {
  saving,
  fetchOrder,
  createOrder,
  updateOrder,
  transitionOrder,
  cancelOrder,
  addItem,
  deleteItem,
  addGift,
  deleteGift,
  recordPayment,
} = useOrders();

const { users, fetchUsers } = useUsers();

const order = ref<Order | null>(null);
const loading = ref(false);
const advancing = ref(false);
const paymentSaving = ref(false);
const hasUnsavedHeader = ref(false);

const contactPicked = ref<any>(null);

const form = reactive({
  assignedSaleId: null as string | null,
  mktOwnerId: null as string | null,
  source: null as string | null,
  shippingMethod: 'cod' as string,
  shippingProvider: null as string | null,
  trackingCode: '',
  deliveryAddress: '',
  orderDate: new Date().toISOString().slice(0, 10),
  internalNote: '',
  customerNote: '',
});

const productDialog = ref(false);
const giftDialog = ref(false);
const cancelDialog = ref(false);
const cancelReason = ref('');
const cancelTried = ref(false);
const trackingDialog = ref(false);
const trackingForm = reactive({ provider: null as string | null, code: '' });

const snack = reactive<{ show: boolean; text: string; color: string }>({ show: false, text: '', color: 'success' });
function showSnack(text: string, color: 'success' | 'error' | 'info' = 'success') {
  snack.text = text;
  snack.color = color;
  snack.show = true;
}

const sourceOptions = ORDER_SOURCE_OPTIONS;
const shippingProviderOptions = SHIPPING_PROVIDER_OPTIONS;

const saleOptions = computed(() =>
  users.value.map((u) => ({ text: u.fullName, value: u.id })),
);
const mktOptions = computed(() =>
  users.value.map((u) => ({ text: u.fullName, value: u.id })),
);

const canEditOrder = computed(() => {
  if (!isAdmin.value) {
    if (!order.value) return true; // creating
    return ['draft', 'confirmed'].includes(order.value.statusNormalized);
  }
  if (!order.value) return true;
  return order.value.statusNormalized !== 'completed' && order.value.statusNormalized !== 'cancelled';
});

const canAdvance = computed(() => canEditOrder.value);

const totalQuantity = computed(() =>
  (order.value?.items ?? []).reduce((s, i) => s + i.quantity, 0),
);

const totalProfit = computed(() => {
  if (!canSeeCost.value || !order.value) return null;
  let total = 0;
  for (const it of order.value.items ?? []) {
    if (it.profit === null || it.profit === undefined) return null;
    total += toNum(it.profit);
  }
  return total;
});

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function markDirty() {
  hasUnsavedHeader.value = true;
}

function onContactPicked(c: any) {
  contactPicked.value = c;
  if (!c) return;
  if (!form.deliveryAddress) form.deliveryAddress = c.address ?? '';
  if (!form.assignedSaleId) form.assignedSaleId = c.assignedUserId ?? authStore.user?.id ?? null;
  markDirty();
}

async function loadOrder() {
  if (!orderId.value) return;
  loading.value = true;
  try {
    const o = await fetchOrder(orderId.value);
    if (!o) {
      showSnack('Không tìm thấy đơn', 'error');
      return;
    }
    applyOrder(o);
  } finally {
    loading.value = false;
  }
}

function applyOrder(o: Order) {
  order.value = o;
  form.assignedSaleId = o.assignedSaleId;
  form.mktOwnerId = o.mktOwnerId;
  form.source = o.source;
  form.shippingMethod = o.shippingMethod ?? 'cod';
  form.shippingProvider = o.shippingProvider;
  form.trackingCode = o.trackingCode ?? '';
  form.deliveryAddress = o.deliveryAddress ?? '';
  form.orderDate = o.orderDate ? o.orderDate.slice(0, 10) : '';
  form.internalNote = o.internalNote ?? '';
  form.customerNote = o.customerNote ?? '';
  hasUnsavedHeader.value = false;

  if (o.contact) {
    contactPicked.value = {
      ...o.contact,
      display: `${o.contact.fullName ?? ''} — ${o.contact.phone ?? ''}`,
    };
  }
}

async function createDraft() {
  if (!contactPicked.value) {
    showSnack('Vui lòng chọn KH', 'error');
    return;
  }
  try {
    const created = await createOrder({
      contactId: contactPicked.value.id,
      assignedSaleId: form.assignedSaleId,
      mktOwnerId: form.mktOwnerId,
      source: form.source,
      shippingMethod: form.shippingMethod,
      shippingProvider: form.shippingProvider,
      trackingCode: form.trackingCode || null,
      deliveryAddress: form.deliveryAddress,
      orderDate: form.orderDate || undefined,
      internalNote: form.internalNote,
      customerNote: form.customerNote,
    });
    showSnack(`Đã tạo đơn nháp ${created.orderCode}`, 'success');
    orderId.value = created.id;
    router.replace(`/orders/${created.id}`);
    applyOrder(created);
  } catch (err: any) {
    showSnack(err?.message ?? 'Tạo đơn thất bại', 'error');
  }
}

async function saveHeader() {
  if (!order.value) return;
  try {
    const updated = await updateOrder(order.value.id, {
      assignedSaleId: form.assignedSaleId,
      mktOwnerId: form.mktOwnerId,
      source: form.source,
      shippingMethod: form.shippingMethod,
      shippingProvider: form.shippingProvider,
      trackingCode: form.trackingCode || null,
      deliveryAddress: form.deliveryAddress,
      orderDate: form.orderDate || null,
      internalNote: form.internalNote,
      customerNote: form.customerNote,
    } as any);
    applyOrder(updated);
    showSnack('Đã lưu thay đổi', 'success');
  } catch (err: any) {
    showSnack(err?.message ?? 'Lưu thất bại', 'error');
  }
}

async function onAddItem(payload: any) {
  if (!order.value) return;
  try {
    await addItem(order.value.id, payload);
    await loadOrder();
    showSnack('Đã thêm SP vào đơn', 'success');
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Thêm SP thất bại', 'error');
  }
}

async function removeItem(itemId: string) {
  if (!order.value) return;
  if (!confirm('Xoá sản phẩm này khỏi đơn?')) return;
  try {
    await deleteItem(order.value.id, itemId);
    await loadOrder();
    showSnack('Đã xoá SP', 'success');
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Xoá thất bại', 'error');
  }
}

async function onAddGift(payload: any) {
  if (!order.value) return;
  try {
    await addGift(order.value.id, payload);
    await loadOrder();
    showSnack('Đã thêm quà tặng', 'success');
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Thêm quà thất bại', 'error');
  }
}

async function removeGift(giftId: string) {
  if (!order.value) return;
  if (!confirm('Xoá quà tặng này?')) return;
  try {
    await deleteGift(order.value.id, giftId);
    await loadOrder();
    showSnack('Đã xoá quà tặng', 'success');
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Xoá quà thất bại', 'error');
  }
}

async function onAdvance(toStatus: OrderStatus) {
  if (!order.value) return;
  if (toStatus === 'shipping') {
    trackingForm.provider = form.shippingProvider;
    trackingForm.code = form.trackingCode;
    trackingDialog.value = true;
    return;
  }
  await doAdvance(toStatus);
}

async function onConfirmShipping() {
  trackingDialog.value = false;
  await doAdvance('shipping', { trackingCode: trackingForm.code, shippingProvider: trackingForm.provider });
}

async function doAdvance(toStatus: OrderStatus, extra: Record<string, unknown> = {}) {
  if (!order.value) return;
  advancing.value = true;
  try {
    const updated = await transitionOrder(order.value.id, toStatus, extra);
    applyOrder(updated);
    showSnack(`Đã chuyển sang ${labelOf(toStatus)}`, 'success');
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Chuyển stage thất bại', 'error');
  } finally {
    advancing.value = false;
  }
}

function labelOf(s: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    draft: 'Nháp',
    confirmed: 'Xác nhận',
    packing: 'Đóng gói',
    shipping: 'Đang giao',
    completed: 'Hoàn tất',
    cancelled: 'Huỷ',
  };
  return map[s] ?? s;
}

async function onCancelOrder() {
  cancelTried.value = true;
  if (!cancelReason.value.trim()) return;
  if (!order.value) return;
  advancing.value = true;
  try {
    const updated = await cancelOrder(order.value.id, cancelReason.value.trim());
    applyOrder(updated);
    cancelDialog.value = false;
    cancelReason.value = '';
    cancelTried.value = false;
    showSnack('Đã huỷ đơn', 'info');
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Huỷ thất bại', 'error');
  } finally {
    advancing.value = false;
  }
}

async function onUpdateDiscount(payload: { discountType: string | null; discountValue: number }) {
  if (!order.value) return;
  try {
    const updated = await updateOrder(order.value.id, payload as any);
    applyOrder(updated);
  } catch (err: any) {
    showSnack(err?.message ?? 'Cập nhật chiết khấu thất bại', 'error');
  }
}
async function onUpdateShipping(shippingFee: number) {
  if (!order.value) return;
  try {
    const updated = await updateOrder(order.value.id, { shippingFee } as any);
    applyOrder(updated);
  } catch (err: any) {
    showSnack(err?.message ?? 'Cập nhật phí ship thất bại', 'error');
  }
}
async function onSavePayment(payload: { paidAmount: number; paymentMethod: string; debtDueDate: string | null }) {
  if (!order.value) return;
  paymentSaving.value = true;
  try {
    const updated = await recordPayment(order.value.id, { ...payload, mode: 'set' });
    applyOrder(updated);
    showSnack('Đã lưu thanh toán', 'success');
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Lưu thất bại', 'error');
  } finally {
    paymentSaving.value = false;
  }
}

// ── Print delivery note ─────────────────────────────────────────────────
// Pattern: hide everything else, show only the print component, call
// window.print(). Browser native "Save as PDF" gives us a free PDF.
const previewPrint = ref(false);

function onPrint() {
  if (!order.value) return;
  if ((order.value.items?.length ?? 0) === 0) {
    showSnack('Đơn chưa có sản phẩm — không thể in phiếu', 'error');
    return;
  }
  previewPrint.value = true;
}

async function doPrint() {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  document.body.classList.add('printing-delivery-note');
  try {
    window.print();
  } finally {
    document.body.classList.remove('printing-delivery-note');
  }
}

function closePrintPreview() {
  previewPrint.value = false;
}

function goBack() {
  router.push('/orders');
}

onMounted(async () => {
  await fetchUsers();
  if (!isNew.value) await loadOrder();
});
</script>

<style scoped>
.section-header {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
.font-mono :deep(.v-field__input),
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.gap-2 {
  gap: 8px;
}
.empty-block {
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 12px;
}
.items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item-row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto auto auto auto;
  gap: 12px;
  align-items: center;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}
.item-thumb {
  width: 48px;
  height: 48px;
}
.item-thumb--empty {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
}
.item-info {
  min-width: 0;
}
.item-info .font-weight-medium {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-qty {
  white-space: nowrap;
}
.item-profit {
  white-space: nowrap;
}
.item-total {
  white-space: nowrap;
  text-align: right;
  min-width: 100px;
}
.gift-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px dashed rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  margin-bottom: 4px;
  background: rgba(16, 185, 129, 0.04);
}
.sticky-card {
  position: sticky;
  top: 16px;
}

@media (max-width: 600px) {
  .item-row {
    grid-template-columns: 40px 1fr auto auto;
  }
  .item-qty,
  .item-profit {
    grid-column: 2;
    font-size: 0.75rem;
  }
}

.print-toolbar {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
</style>

<!-- Global rules for print mode — applied via document.body class toggle.
     Scoped <style> can't reach body so we use a non-scoped block here. -->
<style>
body.printing-delivery-note .v-application__wrap > *:not(.v-overlay-container),
body.printing-delivery-note .v-overlay > *:not(.v-overlay__content),
body.printing-delivery-note .v-overlay__scrim,
body.printing-delivery-note .v-toolbar,
body.printing-delivery-note .v-snackbar {
  visibility: hidden !important;
}
body.printing-delivery-note .v-overlay__content,
body.printing-delivery-note .v-overlay__content * {
  visibility: visible !important;
}
body.printing-delivery-note .v-overlay__content {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: auto !important;
  background: white !important;
  box-shadow: none !important;
}
body.printing-delivery-note .print-host {
  background: white !important;
}
@media print {
  body.printing-delivery-note .v-overlay__content {
    overflow: visible !important;
  }
}
</style>
