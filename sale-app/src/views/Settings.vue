<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/client';
import { formatVND, formatDateTimeVN } from '../composables/useFormat';

const auth = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const loading = ref(false);
const saving = ref(false);
const backfilling = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
const lastResult = ref(null);

const cfg = ref({
  cost_markup_pct: 25,
  tier_delta: 5000,
  enable_backfill: false,
  last_backfill_at: null,
});

// Preview: how a sample SP with cost 100k would price out under current settings.
const previewBase = ref(100_000);
const preview = computed(() => {
  const base = Math.round(previewBase.value * (1 + Number(cfg.value.cost_markup_pct) / 100));
  const delta = Number(cfg.value.tier_delta);
  return {
    vip: base,
    cap1: base + delta,
    ctv: base + 2 * delta,
  };
});

async function load() {
  if (!isAdmin.value) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get('/sale-app/pricing-config');
    cfg.value = { ...cfg.value, ...data };
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Lỗi tải cấu hình';
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    const { data } = await api.put('/sale-app/pricing-config', {
      cost_markup_pct: Number(cfg.value.cost_markup_pct),
      tier_delta: Number(cfg.value.tier_delta),
      enable_backfill: cfg.value.enable_backfill,
    });
    cfg.value = { ...cfg.value, ...data };
    successMsg.value = 'Đã lưu cấu hình';
    setTimeout(() => (successMsg.value = ''), 3000);
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Lỗi lưu cấu hình';
  } finally {
    saving.value = false;
  }
}

async function runBackfill() {
  if (!cfg.value.enable_backfill) {
    errorMsg.value = 'Vui lòng bật "Cho phép backfill" + lưu cấu hình trước.';
    return;
  }
  const msg =
    'Sẽ tạo ProductPrice cho mọi SP active còn thiếu tier. KHÔNG override giá có sẵn.\n\n' +
    `Markup: ${cfg.value.cost_markup_pct}% · Delta: ${formatVND(cfg.value.tier_delta)}\n\nTiếp tục?`;
  if (!confirm(msg)) return;

  backfilling.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  lastResult.value = null;
  try {
    const { data } = await api.post('/sale-app/_backfill-tier-prices');
    lastResult.value = data;
    successMsg.value = `Đã tạo ${data.created_rows} dòng giá cho ${data.touched_products} SP`;
    await load();
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Lỗi chạy backfill';
  } finally {
    backfilling.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-3xl mx-auto">
    <div class="mb-5">
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Cài đặt</h1>
      <p class="text-sm text-ink-secondary mt-0.5">Cấu hình cho Sale App</p>
    </div>

    <div v-if="!isAdmin" class="bg-amber-50 border border-amber-200 text-amber-800 rounded-card p-5">
      Chỉ admin / chủ doanh nghiệp mới truy cập được phần này.
    </div>

    <div v-else class="bg-white border border-line-200 rounded-card p-5 shadow-card">
      <div class="mb-4">
        <h2 class="text-base font-semibold text-ink-primary">Giá tier tự động</h2>
        <p class="text-xs text-ink-secondary mt-0.5">
          Backfill ProductPrice cho SP còn thiếu tier, dựa trên giá vốn.
          Cấp 2 (VIP) = giá vốn × (1 + markup), các cấp khác cộng thêm tier delta.
        </p>
      </div>

      <div v-if="loading" class="text-sm text-ink-secondary py-6 text-center">
        Đang tải...
      </div>

      <div v-else class="space-y-4">
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1.5">Markup vs giá vốn (%)</label>
            <input
              v-model.number="cfg.cost_markup_pct"
              type="number"
              min="0"
              max="500"
              step="0.5"
              class="w-full h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none"
            />
            <p class="text-[11px] text-ink-secondary mt-1">VIP price = cost_price × (1 + markup/100)</p>
          </div>
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1.5">Tier delta (đ)</label>
            <input
              v-model.number="cfg.tier_delta"
              type="number"
              min="0"
              step="500"
              class="w-full h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none"
            />
            <p class="text-[11px] text-ink-secondary mt-1">Khoảng cách giá giữa các cấp</p>
          </div>
        </div>

        <!-- Preview -->
        <div class="bg-surface-50 border border-line-200 rounded-input p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-medium text-ink-primary">Xem trước</div>
            <div class="flex items-center gap-2">
              <label class="text-[11px] text-ink-secondary">Giá vốn mẫu:</label>
              <input
                v-model.number="previewBase"
                type="number"
                step="1000"
                class="w-28 h-8 px-2 rounded border border-line-300 text-xs text-right"
              />
              <span class="text-[11px] text-ink-secondary">đ</span>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div class="bg-white border border-line-200 rounded-lg p-3 text-center">
              <div class="text-[10px] uppercase tracking-wide text-ink-secondary mb-1">Cấp 2 (VIP)</div>
              <div class="text-sm font-bold text-royal-700">{{ formatVND(preview.vip) }}</div>
              <div class="text-[10px] text-ink-disabled mt-0.5">rẻ nhất</div>
            </div>
            <div class="bg-white border border-line-200 rounded-lg p-3 text-center">
              <div class="text-[10px] uppercase tracking-wide text-ink-secondary mb-1">Cấp 1</div>
              <div class="text-sm font-bold text-royal-700">{{ formatVND(preview.cap1) }}</div>
              <div class="text-[10px] text-ink-disabled mt-0.5">+{{ formatVND(cfg.tier_delta) }}</div>
            </div>
            <div class="bg-white border border-line-200 rounded-lg p-3 text-center">
              <div class="text-[10px] uppercase tracking-wide text-ink-secondary mb-1">CTV</div>
              <div class="text-sm font-bold text-royal-700">{{ formatVND(preview.ctv) }}</div>
              <div class="text-[10px] text-ink-disabled mt-0.5">+{{ formatVND(cfg.tier_delta * 2) }}</div>
            </div>
          </div>
        </div>

        <!-- Enable toggle -->
        <label class="flex items-start gap-3 p-3 rounded-input border border-line-200 cursor-pointer hover:bg-surface-50">
          <input
            v-model="cfg.enable_backfill"
            type="checkbox"
            class="mt-0.5 w-4 h-4 accent-royal-700"
          />
          <div>
            <div class="text-sm font-medium text-ink-primary">Cho phép backfill</div>
            <div class="text-[11px] text-ink-secondary mt-0.5">
              Bật cờ này để mở nút "Chạy backfill". Nút sẽ insert ProductPrice còn thiếu cho mọi SP active có cost_price.
              KHÔNG override giá đã có sẵn.
            </div>
          </div>
        </label>

        <div v-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-input px-3 py-2 text-sm">
          {{ errorMsg }}
        </div>
        <div v-if="successMsg" class="bg-green-50 border border-green-200 text-green-700 rounded-input px-3 py-2 text-sm">
          {{ successMsg }}
        </div>

        <div class="flex gap-2 pt-1">
          <button
            @click="save"
            :disabled="saving"
            class="h-11 px-5 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50"
          >
            {{ saving ? 'Đang lưu...' : 'Lưu cấu hình' }}
          </button>
          <button
            @click="runBackfill"
            :disabled="backfilling || !cfg.enable_backfill"
            class="h-11 px-5 rounded-btn bg-amber-500 hover:bg-amber-600 text-navy-900 font-semibold disabled:opacity-40"
          >
            {{ backfilling ? 'Đang chạy...' : 'Chạy backfill' }}
          </button>
        </div>

        <div v-if="cfg.last_backfill_at" class="text-[11px] text-ink-secondary pt-1">
          Lần chạy backfill gần nhất: {{ formatDateTimeVN(cfg.last_backfill_at) }}
        </div>

        <!-- Last result -->
        <div v-if="lastResult" class="border-t border-line-200 pt-4 mt-2">
          <div class="text-sm font-semibold text-ink-primary mb-2">Kết quả chạy gần nhất</div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div class="bg-green-50 rounded-input p-2">
              <div class="text-[10px] text-ink-secondary">Dòng giá tạo</div>
              <div class="text-base font-bold text-green-700">{{ lastResult.created_rows }}</div>
            </div>
            <div class="bg-royal-50 rounded-input p-2">
              <div class="text-[10px] text-ink-secondary">SP đã chạm</div>
              <div class="text-base font-bold text-royal-700">{{ lastResult.touched_products }}</div>
            </div>
            <div class="bg-amber-50 rounded-input p-2">
              <div class="text-[10px] text-ink-secondary">Bỏ qua (đủ tier)</div>
              <div class="text-base font-bold text-amber-600">{{ lastResult.skipped_already_has_tier }}</div>
            </div>
            <div class="bg-red-50 rounded-input p-2">
              <div class="text-[10px] text-ink-secondary">Bỏ qua (thiếu cost)</div>
              <div class="text-base font-bold text-red-700">{{ lastResult.skipped_no_cost }}</div>
            </div>
          </div>
          <div v-if="lastResult.sample_touched_skus?.length" class="mt-2 text-[11px] text-ink-secondary">
            Mẫu SKU: {{ lastResult.sample_touched_skus.join(', ') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
