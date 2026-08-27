<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useImports } from '../composables/useImports';

const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const {
  list,
  listLoading,
  listError,
  suppliers,
  loadList,
  loadSuppliers,
  formatVND,
  formatDateVN,
} = useImports();

const status = ref('');
const supplierId = ref('');
const from = ref('');
const to = ref('');

const statusFilters = [
  { key: '', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'confirmed', label: 'Đã chốt' },
];

let debounceTimer = null;

async function reloadList() {
  if (!isAdmin.value) return;
  await loadList({
    status: status.value,
    supplierId: supplierId.value,
    from: from.value,
    to: to.value,
  });
}

watch([status, supplierId, from, to], () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(reloadList, 250);
});

onMounted(async () => {
  if (!isAdmin.value) return;
  await Promise.all([loadSuppliers(), reloadList()]);
});

function supplierName(imp) {
  return imp.supplier?.name || imp.supplierName || '—';
}

function importDate(imp) {
  return imp.importDate || imp.import_date || imp.createdAt || imp.created_at;
}

function grandTotal(imp) {
  return imp.grandTotal ?? imp.grand_total ?? 0;
}

function statusBadge(s) {
  if (s === 'confirmed') return { label: 'Đã chốt', cls: 'bg-emerald-100 text-emerald-700' };
  if (s === 'draft') return { label: 'Nháp', cls: 'bg-amber-100 text-amber-700' };
  return { label: s || '—', cls: 'bg-gray-100 text-gray-700' };
}

function openImport(id) {
  router.push('/imports/' + id);
}

function createNew() {
  router.push('/imports/new');
}
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1200px] mx-auto">
    <!-- Header — min-w-0 để tiêu đề/phụ đề co được, không đẩy rộng trang ở 320px (27/8/2026) -->
    <div class="flex items-start justify-between gap-2 lg:gap-3 mb-4">
      <div class="min-w-0">
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Nhập kho</h1>
        <!-- Điện thoại: phụ đề ngắn cho đỡ chiếm 2 dòng; desktop giữ nguyên câu cũ -->
        <p class="text-xs text-ink-secondary mt-0.5">
          <span class="lg:hidden">Phiếu nhập hàng từ NCC</span>
          <span class="hidden lg:inline">Quản lý phiếu nhập hàng từ nhà cung cấp</span>
        </p>
      </div>
      <!-- Nút tạo: 44px cho ngón tay ở mobile (h-11), desktop vẫn h-10 như trước -->
      <button
        v-if="isAdmin"
        @click="createNew"
        aria-label="Tạo phiếu nhập"
        class="tap shrink-0 h-11 lg:h-10 px-4 rounded-btn bg-royal-700 text-white text-sm font-semibold hover:bg-royal-800 transition flex items-center gap-1.5 whitespace-nowrap"
      >
        <span class="text-lg leading-none">＋</span>
        <span class="hidden sm:inline">Tạo phiếu nhập</span>
        <span class="sm:hidden">Tạo</span>
      </button>
    </div>

    <!-- Member: không có quyền -->
    <div
      v-if="!isAdmin"
      class="bg-white border border-line-200 rounded-card p-8 lg:p-12 text-center"
    >
      <div class="text-5xl mb-3">🔒</div>
      <div class="font-semibold text-ink-primary">Chức năng dành cho quản lý</div>
      <p class="text-xs text-ink-secondary mt-1">
        Chỉ chủ cửa hàng / quản lý mới xem và tạo được phiếu nhập kho.
      </p>
    </div>

    <template v-else>
      <!-- Filters -->
      <div class="bg-white border border-line-200 rounded-card p-4 shadow-card mb-4">
        <!--
          27/8/2026 — NGUYÊN NHÂN TRÀN NGANG 60px Ở 320px NẰM Ở ĐÂY:
          <select> lấy chiều rộng tối thiểu theo TÊN NHÀ CUNG CẤP DÀI NHẤT trong
          danh sách option (đo được 324px > 288px lòng màn iPhone SE). Ô grid
          không bao giờ co dưới min-content của con → đẩy cả trang rộng ra.
          Fix: 'w-full min-w-0' cho select + 2 ô ngày để chúng co theo khung.
          Mobile xếp 2 cột (ngày Từ / ngày Đến cùng hàng), desktop vẫn 3 cột.
        -->
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3 mb-3">
          <select
            v-model="supplierId"
            aria-label="Lọc theo nhà cung cấp"
            class="col-span-2 lg:col-span-1 w-full min-w-0 h-11 lg:h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
          >
            <option value="">Tất cả nhà cung cấp</option>
            <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <input
            v-model="from"
            type="date"
            aria-label="Từ ngày"
            class="w-full min-w-0 h-11 lg:h-10 px-2 lg:px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-[13px] lg:text-sm"
          />
          <input
            v-model="to"
            type="date"
            aria-label="Đến ngày"
            class="w-full min-w-0 h-11 lg:h-10 px-2 lg:px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-[13px] lg:text-sm"
          />
        </div>

        <!--
          Hàng chip trạng thái: cho CUỘN NGANG trong khung (giống hàng tab ở
          Debt.vue) thay vì flex-wrap — chip whitespace-nowrap trong hàng không
          cuộn được là thủ phạm quen mặt làm rộng cả trang. -mx-4 px-4 để chip
          chạy sát mép trong card p-4; desktop trung hoà về wrap như cũ.
        -->
        <div
          class="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible lg:flex-wrap"
        >
          <button
            v-for="f in statusFilters"
            :key="f.key"
            @click="status = f.key"
            :aria-label="'Lọc trạng thái: ' + f.label"
            class="tap shrink-0 whitespace-nowrap h-11 lg:h-8 px-4 lg:px-3 rounded-full text-xs font-semibold border transition"
            :class="
              status === f.key
                ? 'bg-royal-700 text-white border-royal-700'
                : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
            "
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="listLoading" class="space-y-2.5">
        <div
          v-for="i in 5"
          :key="i"
          class="bg-white border border-line-200 rounded-card h-28 lg:h-20 animate-pulse"
        ></div>
      </div>

      <!-- Error -->
      <div
        v-else-if="listError"
        class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm"
      >
        {{ listError }}
        <!-- Nút "Thử lại" cao 44px ở mobile (min-h-11), desktop vẫn là link block như cũ -->
        <button
          @click="reloadList"
          class="tap mt-2 flex lg:block items-center min-h-11 lg:min-h-0 text-red-700 underline font-medium"
        >
          Thử lại
        </button>
      </div>

      <!-- Empty -->
      <div
        v-else-if="list.length === 0"
        class="bg-white border border-line-200 rounded-card p-8 lg:p-12 text-center"
      >
        <div class="text-5xl mb-3">📦</div>
        <div class="font-semibold text-ink-primary">Chưa có phiếu nhập nào</div>
        <p class="text-xs text-ink-secondary mt-1">
          Bấm "Tạo phiếu nhập" để nhập hàng từ nhà cung cấp.
        </p>
      </div>

      <template v-else>
        <!--
          ĐIỆN THOẠI (<1024px): thẻ 1 phiếu/1 khối, thứ tự đọc bằng 1 tay —
          mã phiếu + ngày → tên NCC (2 dòng rồi ...) → tổng tiền → trạng thái.
          Hàng ngang 5 cột kiểu desktop nhét vào 320px làm tên NCC vỡ từng từ.
        -->
        <div class="lg:hidden space-y-2.5">
          <button
            v-for="imp in list"
            :key="imp.id"
            @click="openImport(imp.id)"
            :aria-label="'Xem phiếu nhập ' + (imp.importCode || imp.import_code || '')"
            class="tap w-full text-left bg-white border border-line-200 rounded-card p-3.5 shadow-card active:bg-royal-50/40 transition"
          >
            <!-- Hàng trên: mã phiếu + ngày · tổng tiền nổi bật -->
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-mono text-[12px] font-semibold text-ink-secondary truncate">
                  {{ imp.importCode || imp.import_code || '—' }}
                </div>
                <div class="text-[11px] text-ink-secondary mt-0.5">
                  {{ formatDateVN(importDate(imp)) }}
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-[17px] leading-tight font-bold text-royal-700 tabular-nums">
                  {{ formatVND(grandTotal(imp)) }}
                </div>
                <div class="text-[10px] text-ink-secondary uppercase">Tổng tiền</div>
              </div>
            </div>

            <!-- Nhà cung cấp: tên dài cho 2 dòng rồi ... (không cắt mất chữ giữa) -->
            <div class="mt-2.5 text-[15px] font-bold text-ink-primary leading-snug line-clamp-2">
              {{ supplierName(imp) }}
            </div>

            <!-- Trạng thái: nhãn tự co theo chữ; mũi tên chỉ để gợi ý bấm được -->
            <div class="mt-2 flex items-center justify-between gap-2">
              <span
                class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg"
                :class="statusBadge(imp.status).cls"
              >
                {{ statusBadge(imp.status).label }}
              </span>
              <span class="shrink-0 text-ink-disabled" aria-hidden="true">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </div>
          </button>
        </div>

        <!-- DESKTOP (>=1024px): giữ nguyên 100% hàng ngang như trước 27/8/2026 -->
        <div class="hidden lg:block space-y-2.5">
          <button
            v-for="imp in list"
            :key="imp.id"
            @click="openImport(imp.id)"
            class="w-full text-left bg-white border border-line-200 rounded-card p-3 shadow-card hover:border-royal-700 transition flex items-center gap-3"
          >
            <!-- Icon -->
            <div class="w-10 h-10 rounded-input bg-surface-soft shrink-0 flex items-center justify-center text-xl">
              📥
            </div>

            <!-- Code + supplier -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[11px] text-ink-secondary truncate">
                  {{ imp.importCode || imp.import_code || '—' }}
                </span>
                <span
                  class="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0"
                  :class="statusBadge(imp.status).cls"
                >
                  {{ statusBadge(imp.status).label }}
                </span>
              </div>
              <div class="text-sm font-semibold text-ink-primary truncate">
                {{ supplierName(imp) }}
              </div>
              <div class="text-[11px] text-ink-secondary mt-0.5">
                {{ formatDateVN(importDate(imp)) }}
              </div>
            </div>

            <!-- Total -->
            <div class="text-right shrink-0">
              <div class="text-base lg:text-lg font-bold tabular-nums text-ink-primary">
                {{ formatVND(grandTotal(imp)) }}
              </div>
              <div class="text-[10px] text-ink-secondary uppercase">Tổng tiền</div>
            </div>

            <svg class="w-4 h-4 text-ink-disabled shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* Thanh cuộn ngang hàng chip trạng thái: ẩn cho gọn (vẫn kéo được). 27/8/2026 */
.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
/* iOS huỷ cú bấm nếu ngón trượt nhẹ ở chip/thẻ (xem BottomNav.vue 27/8/2026). */
.tap {
  touch-action: manipulation;
}
</style>
