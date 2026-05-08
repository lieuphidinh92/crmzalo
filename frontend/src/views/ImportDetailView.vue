<template>
  <div class="import-detail">
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        density="compact"
        @click="goBack"
      />
      <h1 class="text-h5 ml-2">
        Đơn nhập
        <span class="font-mono text-primary">{{ order?.importCode || '...' }}</span>
      </h1>
      <v-chip
        v-if="order"
        :color="order.status === 'confirmed' ? 'success' : 'grey'"
        variant="flat"
        size="small"
        class="ml-2"
      >
        {{ order.status === 'confirmed' ? 'Đã nhập kho' : 'Nháp' }}
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="order?.status === 'draft'"
        variant="outlined"
        prepend-icon="mdi-pencil"
        @click="goEdit"
      >
        Sửa
      </v-btn>
      <v-btn
        v-if="order?.status === 'draft'"
        color="primary"
        variant="flat"
        prepend-icon="mdi-check-circle-outline"
        :loading="confirming"
        @click="onConfirm"
      >
        Xác nhận nhập kho
      </v-btn>
    </div>

    <div v-if="!order" class="d-flex justify-center pa-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <div v-else>
      <!-- Header info -->
      <v-card variant="flat" class="section pa-4 mb-3">
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <div class="info-label">Ngày nhập</div>
            <div class="info-value">{{ formatDateVN(order.importDate) }}</div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="info-label">Nhà cung cấp</div>
            <div class="info-value">{{ order.supplier?.name ?? '—' }}</div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="info-label">Số HĐ NCC</div>
            <div class="info-value font-mono">{{ order.nccInvoiceNo || '—' }}</div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="info-label">Trạng thái</div>
            <div class="info-value">
              {{ order.status === 'confirmed' ? 'Đã nhập kho' : 'Nháp' }}
              <span
                v-if="order.confirmedAt"
                class="text-caption text-medium-emphasis ml-1"
              >
                · {{ formatDateVN(order.confirmedAt) }}
              </span>
            </div>
          </v-col>
          <v-col v-if="order.notes" cols="12" class="mt-2">
            <div class="info-label">Ghi chú</div>
            <div class="info-value">{{ order.notes }}</div>
          </v-col>
        </v-row>
      </v-card>

      <!-- Items -->
      <v-card variant="flat" class="section pa-4 mb-3">
        <h2 class="section-title">Sản phẩm nhập ({{ order.items?.length ?? 0 }})</h2>
        <v-table density="compact" class="lines-table mt-2">
          <thead>
            <tr>
              <th style="width: 40px">#</th>
              <th>Sản phẩm</th>
              <th>Mã lô</th>
              <th class="text-right">SL</th>
              <th class="text-right">Giá nhập</th>
              <th class="text-right">Thành tiền</th>
              <th>NSX</th>
              <th>HSD</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, idx) in order.items" :key="line.id">
              <td>{{ idx + 1 }}</td>
              <td>
                <div class="font-medium">{{ line.product?.name ?? line.productId }}</div>
                <div class="font-mono text-caption text-medium-emphasis">
                  {{ line.product?.sku ?? '' }}
                </div>
              </td>
              <td class="font-mono">{{ line.batchCode }}</td>
              <td class="text-right font-mono">{{ line.quantity }}</td>
              <td class="text-right font-mono">{{ formatVNDFull(line.unitCost) }}</td>
              <td class="text-right font-mono total-cell">
                {{ formatVNDFull(line.lineTotal) }}
              </td>
              <td>{{ formatDateVN(line.manufactureDate) }}</td>
              <td>{{ formatDateVN(line.expiryDate) }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Linked batches (only after confirm) -->
      <v-card
        v-if="order.status === 'confirmed' && order.batches && order.batches.length > 0"
        variant="flat"
        class="section pa-4 mb-3"
      >
        <h2 class="section-title">
          <v-icon size="20" class="mr-1">mdi-warehouse</v-icon>
          Lô đã tạo trong kho
        </h2>
        <v-table density="compact" class="mt-2">
          <thead>
            <tr>
              <th>Mã lô</th>
              <th class="text-right">Còn tồn</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in order.batches" :key="b.id">
              <td class="font-mono">{{ b.batchCode }}</td>
              <td class="text-right font-mono">{{ b.currentQuantity }}</td>
              <td>
                <v-chip size="x-small" variant="flat" :color="b.status === 'active' ? 'success' : 'grey'">
                  {{ b.status }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Summary -->
      <v-card variant="flat" class="section summary-card pa-4">
        <div class="summary-row">
          <span>Tổng số lượng</span>
          <span class="font-mono">{{ order.totalQuantity }} hộp</span>
        </div>
        <div class="summary-row">
          <span>Tổng tiền nhập</span>
          <span class="font-mono summary-total">{{ formatVNDFull(order.totalAmount) }}</span>
        </div>
      </v-card>
    </div>

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3500">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  formatDateVN,
  formatVNDFull,
  useImports,
  type ImportOrder,
} from '@/composables/use-imports';

const route = useRoute();
const router = useRouter();
const { fetchImport, confirmImport, error } = useImports();

const order = ref<ImportOrder | null>(null);
const confirming = ref(false);
const toast = ref({ show: false, text: '', color: 'success' });

onMounted(load);

async function load() {
  const id = String(route.params.id);
  order.value = await fetchImport(id);
  if (!order.value) {
    toast.value = { show: true, text: 'Không tìm thấy đơn nhập', color: 'error' };
    router.replace('/imports');
  }
}

function goBack() {
  router.push('/imports');
}
function goEdit() {
  if (order.value) router.push(`/imports/${order.value.id}/edit`);
}

async function onConfirm() {
  if (!order.value) return;
  if (!confirm(`Xác nhận nhập kho ${order.value.importCode}? Sau khi xác nhận không thể sửa.`)) return;
  confirming.value = true;
  const result = await confirmImport(order.value.id);
  confirming.value = false;
  if (result?.ok) {
    toast.value = {
      show: true,
      text: `Đã nhập kho ${result.batchesCreated} lô hàng`,
      color: 'success',
    };
    await load();
  } else {
    toast.value = {
      show: true,
      text: error.value ?? 'Không xác nhận được',
      color: 'error',
    };
  }
}
</script>

<style scoped>
.import-detail {
  padding: 12px;
  max-width: 1200px;
  margin: 0 auto;
}
.section {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
}
.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  margin: 0;
  display: flex;
  align-items: center;
}
.info-label {
  font-size: 0.78rem;
  color: rgb(148, 163, 184);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.info-value {
  font-size: 0.95rem;
  margin-top: 2px;
}
.lines-table .total-cell {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}
.summary-card {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.08), rgba(249, 115, 22, 0.02)) !important;
  border-color: rgba(249, 115, 22, 0.2) !important;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 0;
  font-size: 0.95rem;
}
.summary-total {
  font-weight: 700;
  font-size: 1.2rem;
  color: rgb(var(--v-theme-primary));
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
