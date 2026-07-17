<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-1 flex-wrap gap-2">
      <div>
        <h1 class="text-h5 mb-0 d-flex align-center">
          <v-icon class="mr-2" color="primary">mdi-cart-outline</v-icon>
          Đơn hàng
        </h1>
        <div class="text-caption text-medium-emphasis">Quản lý đơn sỉ TPCN</div>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="goNew">
        Tạo đơn mới
      </v-btn>
    </div>

    <!-- Pipeline summary cards -->
    <div v-if="summary" class="pipeline-cards mt-3">
      <button
        v-for="s in pipelineCards"
        :key="s.value"
        class="pipeline-card"
        :class="{ 'pipeline-card--active': isActive(s.value) }"
        @click="toggleStatusFilter(s.value)"
      >
        <span class="pipeline-card-icon">
          <v-icon :icon="s.icon" :color="s.color" size="20" />
        </span>
        <span class="pipeline-card-label">{{ s.text }}</span>
        <span class="pipeline-card-count font-mono">{{ summary.counts[s.value] ?? 0 }}</span>
      </button>
    </div>

    <!-- Warning banners -->
    <v-alert
      v-if="(summary?.warnings?.overdueDebt ?? 0) > 0"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-3"
      closable
    >
      🚨 {{ summary?.warnings?.overdueDebt }} đơn quá hạn nợ —
      <a class="text-decoration-underline" href="#" @click.prevent="filterOverdue">Xem ngay</a>
    </v-alert>
    <v-alert
      v-if="(summary?.warnings?.expiringBatches ?? 0) > 0"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-2"
    >
      ⚠ {{ summary?.warnings?.expiringBatches }} lô hàng sắp hết hạn (90 ngày tới)
    </v-alert>

    <!-- Filter bar -->
    <v-card variant="flat" rounded="xl" class="px-4 py-3 my-3">
      <v-row dense align="center">
        <v-col cols="12" sm="6" md="4">
          <v-text-field
            v-model="filters.search"
            placeholder="Tìm mã đơn / KH / SĐT / cửa hàng..."
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            @update:model-value="onFilterChange"
          />
        </v-col>
        <v-col cols="6" sm="6" md="3">
          <v-select
            v-model="filters.saleId"
            :items="saleItems"
            item-title="text"
            item-value="value"
            placeholder="Sale phụ trách"
            clearable
            hide-details
            @update:model-value="onFilterChange"
          />
        </v-col>
        <v-col cols="6" sm="3" md="2">
          <v-text-field
            v-model="filters.from"
            type="date"
            placeholder="Từ"
            hide-details
            clearable
            @update:model-value="onFilterChange"
          />
        </v-col>
        <v-col cols="6" sm="3" md="2">
          <v-text-field
            v-model="filters.to"
            type="date"
            placeholder="Đến"
            hide-details
            clearable
            @update:model-value="onFilterChange"
          />
        </v-col>
        <v-col cols="12" sm="6" md="1">
          <v-select
            v-model="filters.hasDebt"
            :items="debtItems"
            item-title="text"
            item-value="value"
            placeholder="Công nợ"
            hide-details
            @update:model-value="onFilterChange"
          />
        </v-col>
      </v-row>
      <div v-if="hasActiveFilters" class="mt-2 text-right">
        <v-btn variant="text" size="small" prepend-icon="mdi-close" @click="resetFilters">
          Xoá bộ lọc
        </v-btn>
      </div>
    </v-card>

    <!-- Loading skeleton -->
    <v-card v-if="loading && orders.length === 0" variant="flat" rounded="xl" class="pa-4">
      <v-skeleton-loader type="table" />
    </v-card>

    <!-- Empty state -->
    <v-card
      v-else-if="!loading && orders.length === 0"
      variant="flat"
      rounded="xl"
      class="empty-state pa-8 text-center"
    >
      <v-icon size="80" color="grey-lighten-1" class="mb-4">mdi-cart-off</v-icon>
      <div class="text-h6 mb-2">
        {{ hasActiveFilters ? 'Không tìm thấy đơn phù hợp' : 'Chưa có đơn hàng nào' }}
      </div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        {{ hasActiveFilters ? 'Thử bỏ bớt bộ lọc' : 'Bắt đầu bằng cách tạo đơn đầu tiên' }}
      </div>
      <v-btn v-if="!hasActiveFilters" color="primary" prepend-icon="mdi-plus" @click="goNew">
        Tạo đơn đầu tiên
      </v-btn>
      <v-btn v-else variant="text" prepend-icon="mdi-close" @click="resetFilters">
        Xoá bộ lọc
      </v-btn>
    </v-card>

    <!-- Orders table -->
    <v-card v-else variant="flat" rounded="xl">
      <v-table density="comfortable" class="orders-table">
        <thead>
          <tr>
            <th>Mã đơn</th>
            <th>Khách hàng</th>
            <th>Sale</th>
            <th>Ngày</th>
            <th class="text-right">Tổng</th>
            <th>Đã trả / Tổng</th>
            <th>Trạng thái</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in orders"
            :key="o.id"
            class="order-row"
            @click="goDetail(o.id)"
          >
            <td>
              <div class="font-mono text-body-2 font-weight-medium">{{ o.orderCode }}</div>
            </td>
            <td>
              <div class="font-weight-medium">{{ o.contact?.fullName ?? '—' }}</div>
              <div class="text-caption text-medium-emphasis">
                <v-icon size="12">mdi-phone</v-icon>
                {{ o.contact?.phone ?? '' }}
                <span v-if="o.contact?.storeName" class="ml-2">
                  · {{ o.contact.storeName }}
                </span>
              </div>
            </td>
            <td>
              <div class="text-body-2">{{ o.assignedSale?.fullName ?? o.createdBy?.fullName ?? '—' }}</div>
            </td>
            <td class="text-caption">{{ formatDate(o.orderDate ?? o.createdAt) }}</td>
            <td class="text-right font-mono font-weight-medium">{{ formatVND(o.totalAmountValue) }}</td>
            <td>
              <div class="d-flex align-center" style="gap: 6px;">
                <div class="payment-bar">
                  <div class="payment-bar-fill" :class="paymentBarClass(o)" :style="{ width: paymentPct(o) + '%' }" />
                </div>
                <span class="text-caption font-mono">{{ Math.round(paymentPct(o)) }}%</span>
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ formatVND(o.paidAmount) }} / {{ formatVND(o.totalAmountValue) }}
              </div>
              <div v-if="isOverdue(o)" class="text-caption text-error">
                <v-icon size="12">mdi-alert</v-icon> quá hạn
              </div>
            </td>
            <td>
              <v-chip :color="statusColor(o.statusNormalized)" size="small" variant="flat">
                <v-icon size="14" class="mr-1">{{ statusIcon(o.statusNormalized) }}</v-icon>
                {{ statusLabel(o.statusNormalized) }}
              </v-chip>
            </td>
            <td @click.stop>
              <v-menu>
                <template #activator="{ props: actProps }">
                  <v-btn icon size="x-small" variant="text" v-bind="actProps">
                    <v-icon>mdi-dots-vertical</v-icon>
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item prepend-icon="mdi-eye-outline" @click="goDetail(o.id)">
                    <v-list-item-title>Xem chi tiết</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    prepend-icon="mdi-printer"
                    :disabled="!canPrint(o)"
                    @click="openPrint(o)"
                  >
                    <v-list-item-title>In phiếu giao</v-list-item-title>
                  </v-list-item>
                  <v-divider class="my-1" />
                  <v-list-item
                    prepend-icon="mdi-close-circle-outline"
                    :disabled="!canCancel(o)"
                    base-color="error"
                    @click="askCancel(o)"
                  >
                    <v-list-item-title>Huỷ đơn</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <div v-if="orders.length > 0" class="text-caption text-medium-emphasis mt-3 text-center">
      Hiển thị {{ orders.length }} / {{ total }} đơn
    </div>

    <!-- Inline cancel dialog -->
    <v-dialog v-model="cancelDialog" max-width="420">
      <v-card>
        <v-card-title>Huỷ đơn {{ cancelTarget?.orderCode }}?</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="cancelReason"
            label="Lý do huỷ *"
            rows="3"
            autofocus
            hide-details="auto"
            :error-messages="cancelTried && !cancelReason ? 'Bắt buộc' : ''"
          />
          <v-alert
            v-if="cancelTarget && ['packing','shipping'].includes(cancelTarget.statusNormalized)"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            Đơn đã trừ kho — huỷ sẽ tự động hoàn kho về batch gốc.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelDialog = false">Bỏ qua</v-btn>
          <v-btn color="error" :loading="cancelling" @click="confirmCancel">Huỷ đơn</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Inline delivery-note preview dialog -->
    <v-dialog v-model="printOpen" fullscreen scrollable>
      <v-card>
        <v-toolbar density="compact" color="surface" flat class="print-toolbar">
          <v-btn icon variant="text" @click="closePrint">
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-toolbar-title>Xem trước phiếu giao — {{ printOrder?.orderCode }}</v-toolbar-title>
          <v-spacer />
          <v-btn color="primary" prepend-icon="mdi-printer" @click="doPrint">
            In / Lưu PDF
          </v-btn>
        </v-toolbar>
        <v-card-text class="pa-0 print-host">
          <OrderDeliveryNote v-if="printOrder" :order="printOrder" :print-mode="true" />
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
import { useRouter, useRoute } from 'vue-router';
import {
  useOrders,
  ORDER_STATUS_OPTIONS,
  formatVND,
  isOverdue,
  toNum,
  type Order,
  type OrderStatus,
} from '@/composables/use-orders';
import { useUsers } from '@/composables/use-users';
import OrderDeliveryNote from '@/components/orders/OrderDeliveryNote.vue';

const router = useRouter();
const route = useRoute();

const {
  orders,
  total,
  loading,
  summary,
  filters,
  hasActiveFilters,
  fetchOrders,
  fetchOrder,
  fetchPipelineSummary,
  cancelOrder,
  resetFilters,
  statusLabel,
  statusColor,
} = useOrders();

const { users, fetchUsers } = useUsers();

const pipelineCards = ORDER_STATUS_OPTIONS;

const saleItems = computed(() =>
  users.value.map((u) => ({ text: u.fullName, value: u.id })),
);

const debtItems = [
  { text: 'Tất cả', value: '' },
  { text: 'Còn nợ', value: '1' },
  { text: 'Đã trả đủ', value: '0' },
];

let debouncer: ReturnType<typeof setTimeout> | null = null;
function onFilterChange() {
  if (debouncer) clearTimeout(debouncer);
  debouncer = setTimeout(() => fetchOrders(), 250);
}

function isActive(status: OrderStatus): boolean {
  return filters.statuses.includes(status);
}

function toggleStatusFilter(status: OrderStatus) {
  const idx = filters.statuses.indexOf(status);
  if (idx >= 0) filters.statuses.splice(idx, 1);
  else filters.statuses.push(status);
  fetchOrders();
}

function filterOverdue() {
  filters.overdue = true;
  fetchOrders();
}

function statusIcon(s: string) {
  return ORDER_STATUS_OPTIONS.find((o) => o.value === s)?.icon ?? 'mdi-help-circle';
}

function paymentPct(o: any): number {
  const total = toNum(o.totalAmountValue ?? o.totalAmount);
  if (total <= 0) return 0;
  const paid = toNum(o.paidAmount);
  return Math.min(100, (paid / total) * 100);
}
function paymentBarClass(o: any): string {
  const pct = paymentPct(o);
  if (pct >= 100) return 'fill-success';
  if (isOverdue(o)) return 'fill-error';
  if (pct > 0) return 'fill-warning';
  return 'fill-empty';
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function goNew() {
  router.push('/orders/new');
}
function goDetail(id: string) {
  router.push(`/orders/${id}`);
}

// ── Print delivery note from list ──────────────────────────────────────
const printOpen = ref(false);
const printOrder = ref<Order | null>(null);

function canPrint(o: Order): boolean {
  return ['confirmed', 'packing', 'shipping', 'completed'].includes(o.statusNormalized);
}

async function openPrint(o: Order) {
  // Need full detail (items + gifts + contact) for the printed note
  const full = await fetchOrder(o.id);
  if (!full) {
    showSnack('Không tải được đơn — thử lại', 'error');
    return;
  }
  printOrder.value = full;
  printOpen.value = true;
}

function closePrint() {
  printOpen.value = false;
  printOrder.value = null;
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

// ── Cancel from list ────────────────────────────────────────────────────
const cancelDialog = ref(false);
const cancelTarget = ref<Order | null>(null);
const cancelReason = ref('');
const cancelTried = ref(false);
const cancelling = ref(false);

function canCancel(o: Order): boolean {
  return !['completed', 'cancelled'].includes(o.statusNormalized);
}

function askCancel(o: Order) {
  cancelTarget.value = o;
  cancelReason.value = '';
  cancelTried.value = false;
  cancelDialog.value = true;
}

async function confirmCancel() {
  cancelTried.value = true;
  if (!cancelReason.value.trim() || !cancelTarget.value) return;
  cancelling.value = true;
  try {
    await cancelOrder(cancelTarget.value.id, cancelReason.value.trim());
    cancelDialog.value = false;
    showSnack('Đã huỷ đơn', 'info');
    await Promise.all([fetchOrders(), fetchPipelineSummary()]);
  } catch (err: any) {
    showSnack(err?.response?.data?.error ?? 'Huỷ thất bại', 'error');
  } finally {
    cancelling.value = false;
  }
}

const snack = reactive<{ show: boolean; text: string; color: string }>({ show: false, text: '', color: 'success' });
function showSnack(text: string, color: 'success' | 'error' | 'info' = 'success') {
  snack.text = text;
  snack.color = color;
  snack.show = true;
}

onMounted(async () => {
  // If we landed here from a contact detail panel, narrow to that contact.
  const contactId = route.query.contactId;
  if (typeof contactId === 'string' && contactId) {
    filters.contactId = contactId;
  }
  await Promise.all([fetchUsers(), fetchOrders(), fetchPipelineSummary()]);
});
</script>

<style scoped>
.gap-2 { gap: 8px; }

.pipeline-cards {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.pipeline-card {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  transition: all 0.15s ease;
  font-family: inherit;
}
.pipeline-card:hover {
  border-color: rgb(var(--v-theme-primary));
  transform: translateY(-1px);
}
.pipeline-card--active {
  background: rgba(245, 158, 11, 0.16);
  border-color: rgb(var(--v-theme-primary));
}
.pipeline-card-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
}
.pipeline-card-count {
  font-weight: 700;
  font-size: 1rem;
  margin-left: 4px;
}

.empty-state {
  border: 1px dashed rgba(255, 255, 255, 0.18);
}

.orders-table .order-row {
  cursor: pointer;
}
.orders-table .order-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.payment-bar {
  width: 80px;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}
.payment-bar-fill {
  height: 100%;
  border-radius: 999px;
}
.fill-success { background: rgb(var(--v-theme-success)); }
.fill-warning { background: rgb(var(--v-theme-warning)); }
.fill-error { background: rgb(var(--v-theme-error)); }
.fill-empty { background: rgba(255, 255, 255, 0.08); }

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.print-toolbar {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

@media (max-width: 600px) {
  .orders-table th:nth-child(3),
  .orders-table th:nth-child(4),
  .orders-table th:nth-child(6),
  .orders-table td:nth-child(3),
  .orders-table td:nth-child(4),
  .orders-table td:nth-child(6) {
    display: none;
  }
}
</style>
