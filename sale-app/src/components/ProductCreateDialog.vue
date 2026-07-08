<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api/client';

const emit = defineEmits(['close', 'created']);

const sku = ref('');
const name = ref('');
const brandId = ref('');
const packageSize = ref('');
const price = ref('');

const brands = ref([]);
const saving = ref(false);
const errorMsg = ref('');

async function loadBrands() {
  try {
    const { data } = await api.get('/brands', { params: { activeOnly: '1' } });
    brands.value = Array.isArray(data.brands) ? data.brands : [];
  } catch {
    brands.value = [];
  }
}

async function submit() {
  if (saving.value) return;
  errorMsg.value = '';
  const skuT = sku.value.trim();
  const nameT = name.value.trim();
  if (!skuT || !nameT) {
    errorMsg.value = 'Mã SP (SKU) và tên sản phẩm là bắt buộc';
    return;
  }
  saving.value = true;
  try {
    const body = {
      sku: skuT,
      name: nameT,
      brandId: brandId.value || null,
      packageSize: packageSize.value.trim() || null,
    };
    if (price.value !== '' && price.value !== null) {
      body.price = Math.round(Number(price.value)) || 0;
    }
    const { data } = await api.post('/sale-app/products', body);
    emit('created', data.product);
    emit('close');
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Tạo sản phẩm thất bại, thử lại.';
  } finally {
    saving.value = false;
  }
}

onMounted(loadBrands);
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="w-full max-w-md bg-white rounded-card shadow-pop flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="h-14 px-5 flex items-center justify-between border-b border-line-200 shrink-0">
        <div class="text-sm font-semibold text-ink-primary">Thêm sản phẩm mới</div>
        <button
          @click="emit('close')"
          class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
          aria-label="Đóng"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        <!-- Tên -->
        <div>
          <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Tên sản phẩm <span class="text-red-500">*</span></label>
          <input
            v-model="name"
            type="text"
            placeholder="VD: Manhae Ménopause 90 viên"
            class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
          />
        </div>

        <!-- SKU -->
        <div>
          <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Mã SP (SKU) <span class="text-red-500">*</span></label>
          <input
            v-model="sku"
            type="text"
            placeholder="VD: MH_10"
            class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
          />
        </div>

        <!-- Thương hiệu -->
        <div>
          <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Thương hiệu</label>
          <select
            v-model="brandId"
            class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm bg-white"
          >
            <option value="">— Không gắn brand —</option>
            <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>

        <!-- Quy cách -->
        <div>
          <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Quy cách</label>
          <input
            v-model="packageSize"
            type="text"
            placeholder="VD: Hộp 90 viên"
            class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
          />
        </div>

        <!-- Giá niêm yết -->
        <div>
          <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Giá niêm yết (đồng)</label>
          <input
            v-model="price"
            type="number"
            min="0"
            placeholder="Để trống nếu chưa có giá"
            class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm tabular-nums"
          />
          <p class="text-[11px] text-ink-secondary mt-1">
            Giá này áp cho cả 4 bậc (10 / 5 / 1 / &lt;1 thùng). Chỉnh riêng từng bậc trong phần "Chỉnh sửa" sau khi tạo.
          </p>
        </div>

        <div v-if="errorMsg" class="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-input p-2.5">
          {{ errorMsg }}
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-line-200 shrink-0 flex gap-2">
        <button
          @click="emit('close')"
          class="h-11 px-5 rounded-btn border border-line-300 hover:border-line-400 text-ink-primary font-semibold text-sm"
        >
          Huỷ
        </button>
        <button
          @click="submit"
          :disabled="saving"
          class="flex-1 h-11 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-bold text-sm disabled:opacity-50 shadow-pop"
        >
          {{ saving ? 'Đang tạo...' : 'Tạo sản phẩm' }}
        </button>
      </div>
    </div>
  </div>
</template>
