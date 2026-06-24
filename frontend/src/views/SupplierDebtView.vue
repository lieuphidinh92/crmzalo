<template>
  <div class="supplier-debt">
    <!-- Header -->
    <div class="d-flex align-center mb-1 flex-wrap gap-2">
      <div>
        <h1 class="text-h5">
          <v-icon class="mr-2" color="primary">mdi-bank-outline</v-icon>
          Công nợ NCC
        </h1>
        <div class="page-subtitle">Theo dõi thanh toán nhà cung cấp</div>
      </div>
      <v-spacer />
    </div>

    <!-- KPI cards -->
    <v-row dense class="my-3">
      <v-col cols="6" sm="3">
        <v-card variant="flat" class="stat-card pa-3">
          <div class="stat-label">
            <v-icon size="18" color="error">mdi-cash-clock</v-icon>
            Tổng nợ NCC
          </div>
          <div class="stat-value text-error">{{ formatVNDFull(summary.total_debt) }}</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="flat" class="stat-card pa-3">
          <div class="stat-label">
            <v-icon size="18" color="warning">mdi-alert-circle-outline</v-icon>
            Nợ quá hạn
          </div>
          <div class="stat-value" :class="summary.overdue_debt > 0 ? 'text-warning' : ''">
            {{ formatVNDFull(summary.overdue_debt) }}
          </div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="flat" class="stat-card pa-3">
          <div class="stat-label">
            <v-icon size="18" color="primary">mdi-domain</v-icon>
            NCC đang nợ
          </div>
          <div class="stat-value">
            {{ summary.supplier_count }}
            <span class="stat-small text-medium-emphasis">NCC</span>
          </div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="flat" class="stat-card pa-3">
          <div class="stat-label">
            <v-icon size="18" color="primary">mdi-clipboard-text-outline</v-icon>
            Đơn chưa TT
          </div>
          <div class="stat-value">
            {{ summary.total_order_count }}
            <span class="stat-small text-medium-emphasis">đơn</span>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filter chips -->
    <div class="d-flex gap-2 mb-3 flex-wrap">
      <v-chip
        v-for="f in filterChips"
        :key="f.key"
        :color="activeFilter === f.key ? 'primary' : undefined"
        :variant="activeFilter === f.key ? 'flat' : 'outlined'"
        size="small"
        @click="activeFilter = f.key"
      >
        {{ f.label }}
        <span v-if="f.key === 'overdue' && summary.overdue_order_count > 0" class="ml-1 font-weight-bold">
          ({{ summary.overdue_order_count }})
        </span>
      </v-chip>
    </div>

    <!-- Error -->
    <v-alert v-if="errorMsg" type="error" variant="tonal" closable class="mb-3">
      {{ errorMsg }}
    </v-alert>

    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- Empty state -->
    <v-card v-else-if="filteredSuppliers.length === 0" variant="flat" class="empty-card pa-8 text-center">
      <v-icon size="64" color="grey-lighten-1">mdi-check-circle-outline</v-icon>
      <div class="text-h6 mt-3 text-medium-emphasis">Không có công nợ NCC</div>
      <div class="text-body-2 text-medium-emphasis mt-1">
        Khi nhập hàng và xác nhận đơn, công nợ sẽ hiển thị ở đây.
      </div>
    </v-card>

    <!-- Supplier debt table -->
    <v-card v-else variant="flat" class="table-card">
      <v-table hover density="comfortable">
        <thead>
          <tr>
            <th>NCC</th>
            <th>Quốc gia</th>
            <th class="text-end">Tổng mua</th>
            <th class="text-end">Đã trả</th>
            <th class="text-end">Còn nợ</th>
            <th class="text-end">Nợ quá hạn</th>
            <th class="text-center">Đơn nợ</th>
            <th>Hạn gần nhất</th>
            <th class="text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in filteredSuppliers"
            :key="s.id ?? '__none__'"
            class="cursor-pointer"
            @click="openDetail(s)"
          >
            <td>
              <div class="d-flex align-center gap-2">
                <v-avatar size="32" color="primary" variant="tonal">
                  <span class="text-caption font-weight-bold">{{ (s.name ?? '?')[0] }}</span>
                </v-avatar>
                <div>
                  <div class="font-weight-medium">{{ s.name }}</div>
                  <div v-if="s.phone" class="text-caption text-medium-emphasis">{{ s.phone }}</div>
                </div>
              </div>
            </td>
            <td class="text-medium-emphasis">{{ s.country ?? '—' }}</td>
            <td class="text-end font-mono">{{ formatVNDFull(s.total_purchased) }}</td>
            <td class="text-end font-mono text-success">{{ formatVNDFull(s.total_paid) }}</td>
            <td class="text-end font-mono font-weight-bold text-error">{{ formatVNDFull(s.debt) }}</td>
            <td class="text-end font-mono" :class="s.overdue_debt > 0 ? 'text-warning font-weight-bold' : 'text-medium-emphasis'">
              {{ s.overdue_debt > 0 ? formatVNDFull(s.overdue_debt) : '—' }}
            </td>
            <td class="text-center">
              <v-chip size="x-small" :color="s.overdue_orders > 0 ? 'warning' : 'grey'" variant="flat">
                {{ s.order_count }}
                <span v-if="s.overdue_orders > 0" class="ml-1">({{ s.overdue_orders }} quá hạn)</span>
              </v-chip>
            </td>
            <td>
              <span v-if="s.earliest_due" class="font-mono text-caption" :class="isOverdue(s.earliest_due) ? 'text-error font-weight-bold' : ''">
                {{ formatDateVN(s.earliest_due) }}
              </span>
              <span v-else class="text-medium-emphasis">—</span>
            </td>
            <td class="text-center">
              <v-btn size="x-small" variant="text" icon="mdi-eye-outline" @click.stop="openDetail(s)" />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Detail Dialog -->
    <v-dialog v-model="detailOpen" max-width="900" scrollable>
      <v-card v-if="selectedSupplier">
        <v-card-title class="d-flex align-center pa-4">
          <v-avatar size="36" color="primary" variant="tonal" class="mr-3">
            <span class="font-weight-bold">{{ (detailData?.supplier?.name ?? '?')[0] }}</span>
          </v-avatar>
          <div>
            <div>{{ detailData?.supplier?.name ?? selectedSupplier.name }}</div>
            <div class="text-caption text-medium-emphasis">Chi tiết công nợ NCC</div>
          </div>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="detailOpen = false" />
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-4">
          <!-- Detail loading -->
          <div v-if="detailLoading" class="d-flex justify-center py-8">
            <v-progress-circular indeterminate color="primary" />
          </div>

          <template v-else-if="detailData">
            <!-- Supplier info -->
            <v-row dense class="mb-4">
              <v-col cols="12" sm="6" md="3">
                <div class="info-label">MST</div>
                <div class="info-value">{{ detailData.supplier.taxCode ?? '—' }}</div>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <div class="info-label">Ngân hàng</div>
                <div class="info-value">{{ detailData.supplier.bankName ?? '—' }}</div>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <div class="info-label">STK</div>
                <div class="info-value font-mono">{{ detailData.supplier.bankAccount ?? '—' }}</div>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <div class="info-label">Chủ TK</div>
                <div class="info-value">{{ detailData.supplier.bankHolder ?? '—' }}</div>
              </v-col>
            </v-row>

            <!-- Summary cards -->
            <v-row dense class="mb-4">
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="error" class="pa-3 text-center">
                  <div class="text-caption">Tổng nợ</div>
                  <div class="text-h6 font-mono font-weight-bold">{{ formatVNDShort(detailData.summary.total_debt) }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="warning" class="pa-3 text-center">
                  <div class="text-caption">Quá hạn</div>
                  <div class="text-h6 font-mono font-weight-bold">{{ formatVNDShort(detailData.summary.overdue_debt) }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="primary" class="pa-3 text-center">
                  <div class="text-caption">Tổng mua</div>
                  <div class="text-h6 font-mono font-weight-bold">{{ formatVNDShort(detailData.summary.total_purchased) }}</div>
                </v-card>
              </v-col>
              <v-col cols="6" sm="3">
                <v-card variant="tonal" color="grey" class="pa-3 text-center">
                  <div class="text-caption">Đơn còn nợ</div>
                  <div class="text-h6 font-mono font-weight-bold">{{ detailData.summary.orders_with_debt }}</div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Tabs: Orders / Payment History -->
            <v-tabs v-model="detailTab" color="primary" class="mb-3">
              <v-tab value="orders">
                <v-icon size="16" class="mr-1">mdi-clipboard-list-outline</v-icon>
                Đơn nhập ({{ detailData.orders.length }})
              </v-tab>
              <v-tab value="payments">
                <v-icon size="16" class="mr-1">mdi-cash-check</v-icon>
                Lịch sử TT ({{ detailData.payments.length }})
              </v-tab>
            </v-tabs>

            <!-- Orders tab -->
            <div v-if="detailTab === 'orders'">
              <v-table density="compact" hover>
                <thead>
                  <tr>
                    <th>Mã NK</th>
                    <th>Ngày nhập</th>
                    <th>Số HĐ NCC</th>
                    <th class="text-end">Tổng tiền</th>
                    <th class="text-end">Đã trả</th>
                    <th class="text-end">Còn nợ</th>
                    <th>Hạn TT</th>
                    <th>Trạng thái</th>
                    <th class="text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in detailData.orders" :key="o.id">
                    <td class="font-mono font-weight-bold">{{ o.import_code }}</td>
                    <td>{{ formatDateVN(o.import_date) }}</td>
                    <td class="font-mono">{{ o.ncc_invoice_no ?? '—' }}</td>
                    <td class="text-end font-mono">{{ formatVNDFull(o.total_amount) }}</td>
                    <td class="text-end font-mono text-success">{{ formatVNDFull(o.paid_amount) }}</td>
                    <td class="text-end font-mono font-weight-bold" :class="o.debt_amount > 0 ? 'text-error' : 'text-success'">
                      {{ formatVNDFull(o.debt_amount) }}
                    </td>
                    <td>
                      <span v-if="o.payment_due_date" class="font-mono text-caption" :class="o.is_overdue ? 'text-error font-weight-bold' : ''">
                        {{ formatDateVN(o.payment_due_date) }}
                        <v-icon v-if="o.is_overdue" size="14" color="error" class="ml-1">mdi-alert</v-icon>
                      </span>
                      <span v-else class="text-medium-emphasis">—</span>
                    </td>
                    <td>
                      <v-chip size="x-small" :color="paymentStatusColor(o.payment_status)" variant="flat">
                        {{ paymentStatusLabel(o.payment_status) }}
                      </v-chip>
                    </td>
                    <td class="text-center">
                      <v-btn
                        v-if="o.debt_amount > 0"
                        size="x-small"
                        color="success"
                        variant="tonal"
                        prepend-icon="mdi-cash-plus"
                        @click="openPayment(o)"
                      >
                        Thanh toán
                      </v-btn>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>

            <!-- Payments tab -->
            <div v-if="detailTab === 'payments'">
              <div v-if="detailData.payments.length === 0" class="text-center py-6 text-medium-emphasis">
                Chưa có lịch sử thanh toán
              </div>
              <v-table v-else density="compact" hover>
                <thead>
                  <tr>
                    <th>Ngày TT</th>
                    <th>Đơn nhập</th>
                    <th class="text-end">Số tiền</th>
                    <th>Phương thức</th>
                    <th>Số tham chiếu</th>
                    <th>Ghi chú</th>
                    <th class="text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in detailData.payments" :key="p.id">
                    <td class="font-mono">{{ formatDateVN(p.payment_date) }}</td>
                    <td class="font-mono font-weight-bold">{{ p.import_code ?? '—' }}</td>
                    <td class="text-end font-mono text-success font-weight-bold">{{ formatVNDFull(p.amount) }}</td>
                    <td>{{ paymentMethodLabel(p.payment_method) }}</td>
                    <td class="font-mono">{{ p.reference ?? '—' }}</td>
                    <td class="text-medium-emphasis">{{ p.note ?? '—' }}</td>
                    <td class="text-center">
                      <v-btn
                        size="x-small"
                        variant="text"
                        icon="mdi-delete-outline"
                        color="error"
                        :loading="deletingId === p.id"
                        @click="deletePayment(p)"
                      />
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Payment Dialog -->
    <v-dialog v-model="paymentOpen" max-width="500" persistent>
      <v-card>
        <v-card-title class="pa-4">
          <v-icon class="mr-2" color="success">mdi-cash-plus</v-icon>
          Ghi nhận thanh toán NCC
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-alert v-if="paymentError" type="error" variant="tonal" class="mb-3" closable>
            {{ paymentError }}
          </v-alert>

          <div v-if="paymentOrder" class="mb-4">
            <div class="text-caption text-medium-emphasis">Đơn nhập</div>
            <div class="font-weight-bold font-mono">{{ paymentOrder.import_code }}</div>
            <div class="text-caption">
              Tổng: {{ formatVNDFull(paymentOrder.total_amount) }} — Còn nợ:
              <span class="text-error font-weight-bold">{{ formatVNDFull(paymentOrder.debt_amount) }}</span>
            </div>
          </div>

          <v-text-field
            v-model.number="paymentForm.amount"
            label="Số tiền thanh toán (VND) *"
            type="number"
            :hint="`Còn nợ: ${formatVNDFull(paymentOrder?.debt_amount ?? 0)}`"
            persistent-hint
            density="comfortable"
            class="mb-3"
          />
          <v-select
            v-model="paymentForm.paymentMethod"
            :items="paymentMethods"
            item-title="text"
            item-value="value"
            label="Phương thức"
            density="comfortable"
            hide-details
            class="mb-3"
          />
          <v-text-field
            v-model="paymentForm.paymentDate"
            label="Ngày thanh toán"
            type="date"
            density="comfortable"
            hide-details
            class="mb-3"
          />
          <v-text-field
            v-model="paymentForm.reference"
            label="Số tham chiếu (UNC / mã GD)"
            density="comfortable"
            hide-details
            class="mb-3"
          />
          <v-textarea
            v-model="paymentForm.note"
            label="Ghi chú"
            rows="2"
            density="comfortable"
            hide-details
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="paymentOpen = false">Hủy</v-btn>
          <v-btn
            color="success"
            variant="flat"
            :loading="paymentSaving"
            :disabled="!paymentForm.amount || paymentForm.amount <= 0"
            @click="submitPayment"
          >
            Xác nhận thanh toán
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Toast -->
    <v-snackbar v-model="showToast" :timeout="3000" color="success" location="top">
      {{ toastMsg }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';

// ── Types ───────────────────────────────────────────────────────────────
interface SupplierDebtRow {
  id: string | null;
  name: string;
  country: string | null;
  phone: string | null;
  debt: number;
  total_purchased: number;
  total_paid: number;
  overdue_debt: number;
  order_count: number;
  overdue_orders: number;
  earliest_due: string | null;
}

interface ImportOrderDebt {
  id: string;
  import_code: string;
  import_date: string | null;
  ncc_invoice_no: string | null;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  payment_status: string;
  payment_due_date: string | null;
  is_overdue: boolean;
  total_quantity: number;
}

interface PaymentRecord {
  id: string;
  import_order_id: string;
  import_code: string | null;
  amount: number;
  payment_method: string | null;
  payment_date: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
}

interface SupplierDetail {
  supplier: any;
  summary: {
    total_debt: number;
    total_purchased: number;
    overdue_debt: number;
    order_count: number;
    orders_with_debt: number;
  };
  orders: ImportOrderDebt[];
  payments: PaymentRecord[];
}

// ── State ───────────────────────────────────────────────────────────────
const loading = ref(false);
const errorMsg = ref('');
const suppliers = ref<SupplierDebtRow[]>([]);
const summary = ref({
  total_debt: 0,
  overdue_debt: 0,
  overdue_order_count: 0,
  supplier_count: 0,
  total_order_count: 0,
});
const activeFilter = ref<'all' | 'overdue'>('all');

// Detail dialog
const detailOpen = ref(false);
const detailLoading = ref(false);
const selectedSupplier = ref<SupplierDebtRow | null>(null);
const detailData = ref<SupplierDetail | null>(null);
const detailTab = ref('orders');

// Payment dialog
const paymentOpen = ref(false);
const paymentSaving = ref(false);
const paymentError = ref('');
const paymentOrder = ref<ImportOrderDebt | null>(null);
const paymentForm = ref({
  amount: 0,
  paymentMethod: 'bank_transfer',
  paymentDate: new Date().toISOString().slice(0, 10),
  reference: '',
  note: '',
});

// Delete
const deletingId = ref<string | null>(null);

// Toast
const showToast = ref(false);
const toastMsg = ref('');

// ── Computed ────────────────────────────────────────────────────────────
const filterChips = [
  { key: 'all' as const, label: 'Tất cả' },
  { key: 'overdue' as const, label: 'Quá hạn' },
];

const filteredSuppliers = computed(() => {
  if (activeFilter.value === 'overdue') {
    return suppliers.value.filter((s) => s.overdue_orders > 0);
  }
  return suppliers.value;
});

const paymentMethods = [
  { text: 'Chuyển khoản', value: 'bank_transfer' },
  { text: 'Tiền mặt', value: 'cash' },
  { text: 'Khác', value: 'other' },
];

// ── Helpers ─────────────────────────────────────────────────────────────
function formatVNDFull(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0 đ';
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

function formatVNDShort(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ';
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + ' tr';
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

function formatDateVN(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function paymentStatusColor(status: string): string {
  switch (status) {
    case 'paid': return 'success';
    case 'partial': return 'warning';
    default: return 'error';
  }
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'paid': return 'Đã TT';
    case 'partial': return 'TT 1 phần';
    default: return 'Chưa TT';
  }
}

function paymentMethodLabel(method: string | null): string {
  switch (method) {
    case 'bank_transfer': return 'Chuyển khoản';
    case 'cash': return 'Tiền mặt';
    case 'other': return 'Khác';
    default: return '—';
  }
}

function toast(msg: string) {
  toastMsg.value = msg;
  showToast.value = true;
}

// ── Data loading ────────────────────────────────────────────────────────
async function loadData() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [{ data: sumData }, { data: listData }] = await Promise.all([
      api.get('/supplier-debt/summary'),
      api.get('/supplier-debt/suppliers'),
    ]);
    summary.value = sumData;
    suppliers.value = listData.suppliers || [];
  } catch (err: any) {
    errorMsg.value = err.response?.data?.error || 'Không tải được dữ liệu công nợ NCC';
  } finally {
    loading.value = false;
  }
}

async function openDetail(s: SupplierDebtRow) {
  if (!s.id) return;
  selectedSupplier.value = s;
  detailOpen.value = true;
  detailLoading.value = true;
  detailTab.value = 'orders';
  detailData.value = null;
  try {
    const { data } = await api.get(`/supplier-debt/suppliers/${s.id}`);
    detailData.value = data;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.error || 'Lỗi tải chi tiết NCC';
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function openPayment(order: ImportOrderDebt) {
  paymentOrder.value = order;
  paymentForm.value = {
    amount: order.debt_amount,
    paymentMethod: 'bank_transfer',
    paymentDate: new Date().toISOString().slice(0, 10),
    reference: '',
    note: '',
  };
  paymentError.value = '';
  paymentOpen.value = true;
}

async function submitPayment() {
  if (!paymentOrder.value) return;
  paymentSaving.value = true;
  paymentError.value = '';
  try {
    await api.post('/supplier-debt/payments', {
      importOrderId: paymentOrder.value.id,
      amount: paymentForm.value.amount,
      paymentMethod: paymentForm.value.paymentMethod,
      paymentDate: paymentForm.value.paymentDate,
      reference: paymentForm.value.reference || null,
      note: paymentForm.value.note || null,
    });
    toast('Đã ghi nhận thanh toán NCC');
    paymentOpen.value = false;
    // Refresh detail + list
    if (selectedSupplier.value?.id) {
      await openDetail(selectedSupplier.value);
    }
    await loadData();
  } catch (err: any) {
    paymentError.value = err.response?.data?.error || 'Lỗi ghi nhận thanh toán';
  } finally {
    paymentSaving.value = false;
  }
}

async function deletePayment(p: PaymentRecord) {
  if (!confirm(`Xóa bản ghi thanh toán ${formatVNDFull(p.amount)}?`)) return;
  deletingId.value = p.id;
  try {
    await api.delete(`/supplier-debt/payments/${p.id}`);
    toast('Đã xóa bản ghi thanh toán');
    if (selectedSupplier.value?.id) {
      await openDetail(selectedSupplier.value);
    }
    await loadData();
  } catch (err: any) {
    errorMsg.value = err.response?.data?.error || 'Lỗi xóa thanh toán';
  } finally {
    deletingId.value = null;
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────
onMounted(() => loadData());
</script>

<style scoped>
.supplier-debt {
  padding: 12px;
  max-width: 1400px;
  margin: 0 auto;
}
.page-subtitle {
  font-size: 0.85rem;
  color: rgb(148, 163, 184);
}
.stat-card {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
}
.stat-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: rgb(148, 163, 184);
}
.stat-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  font-size: 1.4rem;
  color: rgb(var(--v-theme-on-surface));
  margin-top: 4px;
}
.stat-small {
  font-size: 0.85rem;
  font-weight: 400;
  margin-left: 4px;
}
.table-card {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  overflow: hidden;
}
.empty-card {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cursor-pointer {
  cursor: pointer;
}
.info-label {
  font-size: 0.78rem;
  color: rgb(148, 163, 184);
  margin-bottom: 2px;
}
.info-value {
  font-size: 0.92rem;
}
</style>
