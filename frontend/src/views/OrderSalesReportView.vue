<template>
  <div class="sales-report">
    <header class="report-header">
      <div><h1 class="text-h5">Doanh số theo nhân viên</h1><p class="text-body-2 text-medium-emphasis mt-1">Đối soát doanh số và chi tiết đơn hàng theo khoảng thời gian</p></div>
      <v-btn prepend-icon="mdi-refresh" variant="tonal" :disabled="loading" @click="fetchReport">Làm mới</v-btn>
    </header>
    <v-card rounded="xl" variant="flat" class="pa-4 my-4">
      <div class="presets mb-4">
        <v-btn v-for="p in presets" :key="p.key" size="small" variant="tonal" :disabled="loading" @click="preset(p.key)">{{ p.label }}</v-btn>
      </div>
      <form @submit.prevent="apply()">
        <v-row dense>
          <v-col cols="6" md="2"><v-text-field v-model="filters.from" label="Từ ngày" type="date" hide-details /></v-col>
          <v-col cols="6" md="2"><v-text-field v-model="filters.to" label="Đến ngày" type="date" hide-details /></v-col>
          <v-col cols="12" md="3"><v-select v-model="filters.saleId" label="Nhân viên phụ trách đơn" :items="saleItems" item-title="fullName" item-value="id" hide-details /></v-col>
          <v-col cols="6" md="3"><v-select v-model="filters.status" label="Trạng thái đơn" :items="statuses" item-title="label" item-value="value" hide-details /></v-col>
          <v-col cols="6" md="2"><v-select v-model="filters.reconciled" label="Đối soát" :items="reconciledOptions" item-title="label" item-value="value" hide-details /></v-col>
          <v-col cols="12" md="9"><v-text-field v-model="filters.search" label="Tìm mã đơn, khách hàng, cửa hàng, số điện thoại" prepend-inner-icon="mdi-magnify" hide-details /></v-col>
          <v-col cols="12" md="3"><v-btn type="submit" block color="primary" :disabled="loading" height="48">Xem báo cáo</v-btn></v-col>
        </v-row>
      </form>
      <v-alert v-if="validation" type="warning" variant="tonal" class="mt-3">{{ validation }}</v-alert>
    </v-card>
    <p class="text-body-2 mb-3"><strong>{{ dateVN(applied.from + 'T00:00:00+07:00') }} – {{ dateVN(applied.to + 'T00:00:00+07:00') }}</strong> · {{ selectedSale }} · Giờ Việt Nam</p>
    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      Doanh số là tổng tiền đơn từ đã xác nhận đến hoàn tất, theo ngày đặt đơn (thiếu ngày đặt thì lấy ngày tạo). Không cộng đơn nháp, huỷ, trả hàng và nợ đầu kỳ.
      Đã thu / còn nợ là số hiện tại của các đơn trong kỳ, không phải dòng tiền thu trong kỳ. Nhân viên được xác định theo người phụ trách đơn.
    </v-alert>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }} <v-btn variant="text" @click="fetchReport">Thử lại</v-btn></v-alert>
    <v-skeleton-loader v-if="loading" type="table" />
    <template v-else-if="report">
      <div class="summary-grid mb-4">
        <v-card v-for="k in kpis" :key="k.label" variant="flat" rounded="xl" class="pa-4"><div class="text-body-2 text-medium-emphasis">{{ k.label }}</div><div class="kpi-number mt-2">{{ k.value }}</div></v-card>
      </div>
      <v-card variant="flat" rounded="xl" class="mb-4">
        <div class="section-header pa-4"><div><h2 class="text-h6">Tổng hợp theo nhân viên</h2><p class="text-caption text-medium-emphasis">Bấm “Xem đơn” để đối chiếu các đơn của nhân viên.</p></div><v-btn v-if="applied.saleId" variant="text" @click="allSales">Tất cả nhân viên</v-btn></div>
        <v-table class="numeric-table" density="comfortable">
          <thead><tr><th>Nhân viên</th><th class="text-right">Số đơn tính doanh số</th><th class="text-right">Doanh số</th><th class="text-right">Đã thu</th><th class="text-right">Còn nợ</th><th></th></tr></thead>
          <tbody><tr v-for="sale in report.bySale" :key="sale.saleId || 'unassigned'"><td class="font-weight-medium">{{ sale.saleName }}</td><td class="text-right">{{ sale.orderCount }}</td><td class="text-right">{{ money(sale.revenue) }}</td><td class="text-right">{{ money(sale.paid) }}</td><td class="text-right">{{ money(sale.debt) }}</td><td><v-btn variant="text" size="small" :aria-label="'Xem đơn của ' + sale.saleName" @click="selectSale(sale.saleId)">Xem đơn</v-btn></td></tr>
          <tr v-if="!report.bySale.length"><td colspan="6" class="text-center pa-6">Không có doanh số trong khoảng thời gian đã chọn.</td></tr></tbody>
        </v-table>
      </v-card>
      <v-card variant="flat" rounded="xl">
        <div class="pa-4"><h2 class="text-h6">Chi tiết đơn hàng · {{ report.total }} đơn</h2><p class="text-caption text-medium-emphasis">{{ selectedSale }} · Bấm mã đơn để xem sản phẩm, thanh toán và chứng từ.</p></div>
        <div v-if="!report.rows.length" class="text-center pa-8"><v-icon icon="mdi-file-search-outline" size="48" color="grey" /><p class="mt-3">Không có đơn phù hợp. Thử đổi khoảng ngày hoặc bộ lọc.</p></div>
        <v-table v-else class="numeric-table" density="comfortable">
          <thead><tr><th>Mã đơn / ngày</th><th>Khách hàng</th><th>Nhân viên</th><th>Trạng thái</th><th class="text-right">Tổng đơn</th><th class="text-right">Đã thu</th><th class="text-right">Còn nợ</th><th>Đối soát</th><th>Hoá đơn VAT</th></tr></thead>
          <tbody><tr v-for="order in report.rows" :key="order.id">
            <td><RouterLink :to="'/orders/' + order.id" class="order-link">{{ order.orderCode }}</RouterLink><div class="text-caption text-medium-emphasis">{{ dateVN(order.orderDate || order.createdAt) }}</div></td>
            <td class="customer-cell"><div>{{ order.contact?.fullName || order.contact?.storeName || '—' }}</div><div class="text-caption text-medium-emphasis">{{ order.contact?.phone }}</div></td>
            <td>{{ order.assignedSale?.fullName || 'Chưa gán' }}</td><td><v-chip size="small" :color="['cancelled','returned'].includes(order.status) ? 'error' : 'primary'" variant="tonal">{{ statusLabels[order.status] || order.status }}</v-chip></td>
            <td class="text-right">{{ money(order.totalAmountValue) }}</td><td class="text-right">{{ money(order.paidAmount) }}</td><td class="text-right">{{ money(order.debtAmountValue) }}</td>
            <td><v-chip size="small" :color="order.reconciledAt ? 'success' : 'warning'" variant="tonal">{{ order.reconciledAt ? 'Đã đối soát' : 'Chưa đối soát' }}</v-chip></td>
            <td>{{ vatLabels[order.vatInvoiceStatus] || 'Chưa xuất' }}<div v-if="order.vatIssuedAmount" class="text-caption">{{ money(order.vatIssuedAmount) }}</div></td>
          </tr></tbody>
        </v-table>
        <div v-if="report.total > 50" class="pa-3"><p class="text-caption text-center">Trang {{ page }} / {{ pageCount }} · 50 đơn mỗi trang. Số tổng hợp tính trên toàn bộ kết quả.</p><v-pagination :model-value="page" :length="pageCount" :total-visible="5" @update:model-value="changePage" /></div>
      </v-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useOrderSalesReport, money, dateVN, statusLabels, vatLabels } from '@/composables/use-order-sales-report';
const { filters, applied, report, page, pageCount, selectedSale, loading, error, validation, apply, fetchReport, preset, selectSale, allSales, changePage } = useOrderSalesReport();
const savedSales = ref<{ id: string; fullName: string }[]>([]);
watch(report, value => { if (value) savedSales.value = value.saleOptions; });
const saleItems = computed(() => [{ id: '', fullName: 'Tất cả nhân viên' }, ...savedSales.value, { id: 'unassigned', fullName: 'Chưa gán nhân viên' }]);
const presets = [{ key: 'today', label: 'Hôm nay' }, { key: 'week', label: 'Tuần này' }, { key: 'month', label: 'Tháng này' }, { key: 'lastMonth', label: 'Tháng trước' }, { key: 'quarter', label: 'Quý này' }, { key: 'year', label: 'Năm nay' }];
const statuses = [{ value: '', label: 'Đơn tính doanh số' }, { value: 'all', label: 'Tất cả trạng thái' }, ...Object.entries(statusLabels).filter(([key]) => !['new','shipped','paid'].includes(key)).map(([value, label]) => ({ value, label }))];
const reconciledOptions = [{ value: '', label: 'Tất cả' }, { value: '0', label: 'Chưa đối soát' }, { value: '1', label: 'Đã đối soát' }];
const kpis = computed(() => report.value ? [
  { label: 'Doanh số trong kỳ', value: money(report.value.summary.revenue) },
  { label: 'Số đơn tính doanh số', value: report.value.summary.orderCount.toLocaleString('vi-VN') },
  { label: 'Đã thu của các đơn trong kỳ', value: money(report.value.summary.paid) },
  { label: 'Còn nợ của các đơn trong kỳ', value: money(report.value.summary.debt) },
] : []);
</script>

<style scoped>
.sales-report { max-width: 1600px; margin: 0 auto; }
.report-header, .section-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.presets { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.presets > * { flex-shrink: 0; min-height: 40px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.kpi-number { font-size: clamp(18px, 1.8vw, 26px); font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.numeric-table :deep(td), .numeric-table :deep(th) { white-space: nowrap; font-variant-numeric: tabular-nums; }
.numeric-table :deep(.customer-cell) { white-space: normal; min-width: 180px; max-width: 280px; }
.order-link { color: rgb(var(--v-theme-primary)); font-weight: 600; text-decoration: underline; display: inline-block; padding: 6px 0; }
@media (max-width: 800px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
