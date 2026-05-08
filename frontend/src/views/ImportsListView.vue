<template>
  <div class="imports-list">
    <!-- Header -->
    <div class="d-flex align-center mb-1 flex-wrap gap-2">
      <div>
        <h1 class="text-h5">Nhập hàng</h1>
        <div class="page-subtitle">Quản lý đơn nhập hàng từ NCC theo lô (FIFO)</div>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="goCreate">
        Tạo đơn nhập mới
      </v-btn>
    </div>

    <!-- Stats cards -->
    <v-row dense class="my-3">
      <v-col cols="12" sm="4">
        <v-card variant="flat" class="stat-card pa-3">
          <div class="stat-label">
            <v-icon size="18" color="primary">mdi-cash-multiple</v-icon>
            Tổng nhập tháng này
          </div>
          <div class="stat-value">{{ formatVNDFull(stats.monthAmount) }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="flat" class="stat-card pa-3">
          <div class="stat-label">
            <v-icon size="18" color="primary">mdi-clipboard-text-outline</v-icon>
            Tổng đơn (đã tải)
          </div>
          <div class="stat-value">
            {{ stats.totalCount }}
            <span class="stat-small text-medium-emphasis">đơn</span>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="flat" class="stat-card pa-3">
          <div class="stat-label">
            <v-icon size="18" color="warning">mdi-pencil-outline</v-icon>
            Đơn nháp chờ confirm
          </div>
          <div class="stat-value">
            {{ stats.draftCount }}
            <span class="stat-small text-medium-emphasis">đơn</span>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filter bar -->
    <v-row dense class="mb-2 align-center">
      <v-col cols="12" sm="4">
        <v-text-field
          v-model="filters.search"
          prepend-inner-icon="mdi-magnify"
          label="Tìm kiếm Mã NK / Số HĐ NCC"
          clearable
          hide-details
          density="comfortable"
          @update:model-value="onFilterChange"
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-select
          v-model="filters.supplierId"
          :items="supplierItems"
          item-title="name"
          item-value="id"
          label="NCC"
          clearable
          hide-details
          density="comfortable"
          @update:model-value="onFilterChange"
        />
      </v-col>
      <v-col cols="6" sm="2">
        <v-select
          v-model="filters.status"
          :items="STATUS_OPTIONS_FILTER"
          item-title="text"
          item-value="value"
          label="Trạng thái"
          hide-details
          density="comfortable"
          @update:model-value="onFilterChange"
        />
      </v-col>
      <v-col cols="6" sm="1.5">
        <v-text-field
          v-model="filters.from"
          label="Từ"
          type="date"
          hide-details
          density="comfortable"
          @update:model-value="onFilterChange"
        />
      </v-col>
      <v-col cols="6" sm="1.5">
        <v-text-field
          v-model="filters.to"
          label="Đến"
          type="date"
          hide-details
          density="comfortable"
          @update:model-value="onFilterChange"
        />
      </v-col>
    </v-row>

    <!-- Data table -->
    <v-data-table-server
      :headers="headers"
      :items="imports"
      :items-length="total"
      :loading="loading"
      :items-per-page="pagination.limit"
      :items-per-page-options="[20, 50, 100, 200]"
      :page="pagination.page"
      item-value="id"
      hover
      @click:row="onRowClick"
      @update:page="onPageChange"
      @update:items-per-page="onLimitChange"
    >
      <template #item.importCode="{ item }">
        <span class="font-mono font-weight-bold">{{ item.importCode }}</span>
      </template>
      <template #item.importDate="{ item }">
        {{ formatDateVN(item.importDate) }}
      </template>
      <template #item.supplier="{ item }">
        {{ item.supplier?.name ?? '—' }}
      </template>
      <template #item.nccInvoiceNo="{ item }">
        <span class="font-mono">{{ item.nccInvoiceNo || '—' }}</span>
      </template>
      <template #item.totalQuantity="{ item }">
        <span class="font-mono">{{ item.totalQuantity }}</span>
      </template>
      <template #item.totalAmount="{ item }">
        <span class="font-mono money-pos">{{ formatVNDFull(item.totalAmount) }}</span>
      </template>
      <template #item.status="{ item }">
        <v-chip
          size="small"
          :color="item.status === 'confirmed' ? 'success' : 'grey'"
          variant="flat"
        >
          {{ item.status === 'confirmed' ? 'Đã nhập kho' : 'Nháp' }}
        </v-chip>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="item.status === 'draft'"
          size="x-small"
          variant="text"
          icon="mdi-pencil"
          @click.stop="goEdit(item.id)"
        />
        <v-btn
          size="x-small"
          variant="text"
          icon="mdi-eye-outline"
          @click.stop="goDetail(item.id)"
        />
      </template>
    </v-data-table-server>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IMPORT_STATUS_OPTIONS,
  formatDateVN,
  formatVNDFull,
  useImports,
} from '@/composables/use-imports';

const router = useRouter();
const {
  imports,
  total,
  loading,
  filters,
  pagination,
  suppliers,
  stats,
  fetchSuppliers,
  fetchImports,
} = useImports();

const STATUS_OPTIONS_FILTER = IMPORT_STATUS_OPTIONS.map((o) => ({ ...o }));

const headers = [
  { title: 'Mã NK', key: 'importCode' },
  { title: 'Ngày', key: 'importDate' },
  { title: 'NCC', key: 'supplier' },
  { title: 'Số HĐ NCC', key: 'nccInvoiceNo' },
  { title: 'Tổng SL', key: 'totalQuantity', align: 'end' as const },
  { title: 'Tổng tiền', key: 'totalAmount', align: 'end' as const },
  { title: 'Trạng thái', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

const supplierItems = computed(() =>
  [{ id: '' as string, name: 'Tất cả NCC', country: null as string | null }, ...suppliers.value],
);

onMounted(async () => {
  await fetchSuppliers();
  await fetchImports();
});

function onFilterChange() {
  pagination.page = 1;
  fetchImports();
}
function onPageChange(page: number) {
  pagination.page = page;
  fetchImports();
}
function onLimitChange(limit: number) {
  pagination.limit = limit;
  pagination.page = 1;
  fetchImports();
}

function goCreate() {
  router.push('/imports/new');
}
function goEdit(id: string) {
  router.push(`/imports/${id}/edit`);
}
function goDetail(id: string) {
  router.push(`/imports/${id}`);
}
function onRowClick(_e: Event, ctx: { item: { id: string; status: string } }) {
  if (ctx.item.status === 'draft') goEdit(ctx.item.id);
  else goDetail(ctx.item.id);
}
</script>

<style scoped>
.imports-list {
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
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.money-pos {
  color: rgb(16, 185, 129);
  font-weight: 600;
}
</style>
