<script setup>
import { ref, computed, watch } from 'vue';
import { api } from '../api/client';
import { useScreenCache } from '../composables/use-screen-cache';
import CustomerListItem from '../components/CustomerListItem.vue';
import CustomerDetailDrawer from '../components/CustomerDetailDrawer.vue';
import NewCustomerDialog from '../components/NewCustomerDialog.vue';

const customers = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(20);
const loading = ref(false);
const errorMsg = ref('');
// Lỗi XUẤT EXCEL phải có biến RIÊNG. Trước 27/8/2026 nó ghi chung vào
// errorMsg — mà errorMsg là nhánh `v-else-if` của danh sách, nên xuất lỗi 1 cái
// là cả danh sách khách biến mất, chỉ còn khung đỏ (làm giống Products.vue).
const exportError = ref('');

const q = ref('');
const tier = ref('');
const customerType = ref('');
const filter = ref('');
const sort = ref('recent');
const rank = ref(''); // PR4 — filter hạng KH

const detailId = ref(null);
const showCreate = ref(false);
const exporting = ref(false);
// Điện thoại: "Xuất Excel" gần như không dùng khi đi thị trường, mà 2 nút trên
// header ăn hết chiều ngang màn 390px → gom vào bảng trồi từ dưới (27/8/2026),
// giống cách đã làm ở Products.vue.
const showActionSheet = ref(false);
let debounceTimer = null;

const tierOptions = [
  { value: '', label: 'Tất cả bảng giá' },
  { value: 'thung_10', label: '10 thùng' },
  { value: 'thung_5', label: '5 thùng' },
  { value: 'thung_1', label: '1 thùng' },
  { value: 'le', label: '<1 thùng' },
];
const typeOptions = [
  { value: '', label: 'Tất cả loại KH' },
  { value: 'nha_thuoc', label: 'Nhà thuốc' },
  { value: 'si_online', label: 'Sỉ online' },
  { value: 'duoc_si', label: 'Dược sĩ' },
  { value: 'cua_hang_me_be', label: 'Cửa hàng mẹ bé' },
];
const sortOptions = [
  { value: 'recent', label: 'Mua gần nhất' },
  { value: 'name', label: 'Tên A → Z' },
  { value: 'newest', label: 'Mới thêm' },
  { value: 'debt', label: 'Công nợ cao' },
  { value: 'revenue', label: 'Doanh số cao' }, // PR4
  { value: 'rank', label: 'Hạng KH cao' },     // PR4
  { value: 'code', label: 'Mã KH (A→Z)' },     // PR4
];
const rankOptions = [
  { value: '', label: 'Tất cả hạng' },
  { value: 'top_1', label: 'Top 1 — VIP' },
  { value: 'top_2', label: 'Top 2 — Thân thiết' },
  { value: 'top_3', label: 'Top 3 — Thường' },
  { value: 'top_4', label: 'Top 4 — Ít hoạt động' },
  { value: 'no_data', label: 'Chưa có hạng' },
];
const filterChips = [
  { key: '', label: 'Tất cả' },
  { key: 'has_debt', label: 'Còn công nợ' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

async function load(silent = false) {
  if (!silent) loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get('/sale-app/customers', {
      params: {
        q: q.value,
        tier: tier.value,
        customerType: customerType.value,
        filter: filter.value,
        sort: sort.value,
        rank: rank.value, // PR4
        page: page.value,
        limit: limit.value,
      },
    });
    customers.value = data.customers || [];
    total.value = data.total ?? customers.value.length;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được danh sách khách hàng';
    customers.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

watch([q, tier, customerType, filter, sort, rank], () => {
  page.value = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 250);
});
watch(page, load);

useScreenCache(load, { ttl: 120_000 });

function onCreated(customer) {
  showCreate.value = false;
  // Drop the new customer in and open its detail.
  load();
  if (customer?.id) detailId.value = customer.id;
}

function onUpdated() {
  // Refresh the list row so name / tier / phone stay in sync.
  load();
}

async function exportExcel() {
  exportError.value = '';
  if (exporting.value) return;
  exporting.value = true;
  try {
    const res = await api.get('/sale-app/customers/export', {
      params: {
        q: q.value,
        tier: tier.value,
        customerType: customerType.value,
        filter: filter.value,
        rank: rank.value,
      },
      responseType: 'blob',
    });
    const cd = res.headers?.['content-disposition'] ?? '';
    const match = /filename="?([^"]+)"?/.exec(cd);
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fallback = `Khach-hang-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.xlsx`;
    const filename = match?.[1] ?? fallback;
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    exportError.value =
      err.response?.status === 403
        ? 'Bạn không có quyền xuất file.'
        : err.response?.data?.error || 'Xuất Excel thất bại, thử lại.';
  } finally {
    exporting.value = false;
  }
}

const pageNumbers = computed(() => {
  const pages = [];
  const max = totalPages.value;
  const cur = page.value;
  if (max <= 7) {
    for (let i = 1; i <= max; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (cur > 3) pages.push('…');
  for (let i = Math.max(2, cur - 1); i <= Math.min(max - 1, cur + 1); i++) pages.push(i);
  if (cur < max - 2) pages.push('…');
  pages.push(max);
  return pages;
});
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary truncate">Khách hàng</h1>
        <p class="text-xs text-ink-secondary mt-0.5">{{ total.toLocaleString('vi-VN') }} khách hàng</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <!-- Điện thoại: nút "..." mở bảng trồi (chứa Xuất Excel) -->
        <button
          @click="showActionSheet = true"
          class="lg:hidden h-11 w-11 shrink-0 rounded-btn border border-line-300 text-ink-secondary flex items-center justify-center active:bg-surface-soft transition"
          aria-label="Thao tác khác với danh sách khách hàng"
          title="Xuất Excel"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
          </svg>
        </button>
        <!-- Máy tính: giữ nguyên nút Xuất Excel như cũ -->
        <button
          @click="exportExcel"
          :disabled="exporting"
          class="hidden lg:flex h-10 px-3 rounded-btn border border-line-300 hover:border-emerald-600 text-emerald-700 text-sm font-semibold items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
        >
          <svg v-if="!exporting" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <svg v-else class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25" /><path d="M22 12a10 10 0 01-10 10" />
          </svg>
          {{ exporting ? 'Đang xuất…' : 'Xuất Excel' }}
        </button>
        <button
          @click="showCreate = true"
          class="h-11 lg:h-10 px-3.5 lg:px-4 shrink-0 rounded-btn bg-royal-700 hover:bg-royal-800 active:bg-royal-800 text-white text-sm font-semibold shadow-pop flex items-center gap-1.5 whitespace-nowrap"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Tạo KH
        </button>
      </div>
    </div>

    <!-- Filters -->
    <!-- Bộ lọc — điện thoại: 3 select + sắp xếp xếp LƯỚI 2 CỘT thay vì 4 hàng
         dọc. Trước 27/8/2026 khối này cao gần hết màn 390px, phải cuộn mới
         thấy khách đầu tiên. Máy tính giữ nguyên lưới 5 cột + hàng chip. -->
    <div class="bg-white border border-line-200 rounded-card p-3 lg:p-4 shadow-card mb-4">
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-2.5 lg:gap-3 mb-2.5 lg:mb-3">
        <div class="relative col-span-2 lg:col-span-2">
          <input
            v-model="q"
            type="search"
            placeholder="Tìm tên / SĐT / cửa hàng / mã KH..."
            class="w-full h-11 lg:h-10 pl-10 pr-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white text-sm"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <select v-model="tier" class="min-w-0 h-11 lg:h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm">
          <option v-for="o in tierOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="customerType" class="min-w-0 h-11 lg:h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm">
          <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <!-- PR4 — filter hạng KH -->
        <select v-model="rank" class="min-w-0 h-11 lg:h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm">
          <option v-for="o in rankOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <!-- ĐIỆN THOẠI: ô sắp xếp nằm luôn trong lưới (ô thứ 4 của hàng cuối)
             để không tốn thêm 1 hàng riêng. Máy tính vẫn dùng ô ở hàng chip
             bên dưới nên ô này ẩn từ lg. Cùng v-model nên 2 ô luôn khớp. -->
        <select
          v-model="sort"
          class="lg:hidden min-w-0 h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
          aria-label="Sắp xếp danh sách khách hàng"
        >
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">↕ {{ o.label }}</option>
        </select>
      </div>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <!-- Chip lọc: điện thoại cuộn ngang (chip cao 44px), máy tính wrap như cũ -->
        <div class="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
          <button
            v-for="chip in filterChips"
            :key="chip.key"
            @click="filter = chip.key"
            class="tap shrink-0 whitespace-nowrap h-11 lg:h-8 px-3.5 lg:px-3 rounded-full text-xs font-semibold border transition"
            :class="filter === chip.key ? 'bg-royal-700 text-white border-royal-700' : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'"
          >
            {{ chip.label }}
          </button>
        </div>
        <select v-model="sort" class="hidden lg:block h-8 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-xs">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">Sắp xếp: {{ o.label }}</option>
        </select>
      </div>
    </div>

    <!-- List -->
    <!-- Lỗi xuất Excel: dòng nhẹ phía trên, danh sách vẫn còn nguyên -->
    <div
      v-if="exportError"
      class="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2"
    >
      <span class="flex-1">{{ exportError }}</span>
      <button @click="exportError = ''" class="shrink-0 w-6 h-6 leading-none text-red-700" aria-label="Đóng">✕</button>
    </div>

    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 6" :key="i" class="bg-white border border-line-200 rounded-card h-20 animate-pulse"></div>
    </div>

    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <div v-else-if="customers.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Không có khách hàng</div>
      <p class="text-xs text-ink-secondary mt-1">Thử bỏ filter hoặc tạo khách hàng mới.</p>
    </div>

    <div v-else>
      <div class="space-y-2.5">
        <CustomerListItem
          v-for="c in customers"
          :key="c.id"
          :customer="c"
          @open="detailId = $event.id"
        />
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-1.5">
        <button @click="page = Math.max(1, page - 1)" :disabled="page <= 1" class="tap h-11 w-11 lg:h-9 lg:w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
        <button
          v-for="(n, idx) in pageNumbers"
          :key="idx"
          @click="typeof n === 'number' && (page = n)"
          :disabled="typeof n !== 'number'"
          class="tap h-11 lg:h-9 min-w-[44px] lg:min-w-[36px] px-2 rounded-btn text-sm font-medium transition"
          :class="n === page ? 'bg-royal-700 text-white' : typeof n === 'number' ? 'border border-line-300 hover:border-royal-700 text-ink-primary' : 'text-ink-disabled'"
        >{{ n }}</button>
        <button @click="page = Math.min(totalPages, page + 1)" :disabled="page >= totalPages" class="tap h-11 w-11 lg:h-9 lg:w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">›</button>
      </div>
    </div>

    <!-- Bảng thao tác (chỉ điện thoại) — mở từ nút "..." trên header -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showActionSheet"
          class="lg:hidden fixed inset-0 z-50 bg-black/40"
          @click="showActionSheet = false"
        />
      </Transition>
      <Transition name="sheet">
        <div
          v-if="showActionSheet"
          class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl"
          style="padding-bottom: calc(env(safe-area-inset-bottom) + 12px)"
        >
          <div class="pt-3 pb-1 flex flex-col items-center">
            <div class="w-10 h-1 rounded-full bg-line-200"></div>
          </div>
          <div class="px-5 pt-1 pb-2 flex items-center justify-between">
            <h3 class="text-base font-bold text-ink-primary">Danh sách khách hàng</h3>
            <button
              @click="showActionSheet = false"
              class="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink-secondary active:bg-surface-soft"
              aria-label="Đóng"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="px-3 pb-2">
            <button
              @click="showActionSheet = false; exportExcel()"
              :disabled="exporting"
              class="w-full h-12 px-3 rounded-xl flex items-center gap-3 text-sm font-semibold text-ink-primary active:bg-surface-soft disabled:opacity-50"
            >
              <span class="w-9 h-9 rounded-full bg-surface-soft text-emerald-700 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              {{ exporting ? 'Đang xuất Excel…' : 'Xuất danh sách ra Excel' }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Detail drawer -->
    <CustomerDetailDrawer
      :customer-id="detailId"
      @close="detailId = null"
      @updated="onUpdated"
    />

    <!-- Create dialog -->
    <NewCustomerDialog
      v-if="showCreate"
      @close="showCreate = false"
      @created="onCreated"
    />
  </div>
</template>

<style scoped>
/* Hàng chip cuộn ngang: ẩn thanh cuộn cho gọn (giống Orders/Products 27/8/2026) */
.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
/* iOS hay huỷ cú bấm khi ngón trượt nhẹ trên chip/nút */
.tap {
  touch-action: manipulation;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
