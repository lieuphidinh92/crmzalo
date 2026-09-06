<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';

const props = defineProps({ order: { type: Object, default: null } });
const emit = defineEmits(['close', 'queued']);
const loading = ref(false);
const saving = ref(false);
const preflight = ref(null);
const rates = ref({});
const errorMsg = ref('');
const infoMsg = ref('');

const calculations = computed(() => (preflight.value?.lines || []).map((line) => {
  const rate = Number(rates.value[line.itemId] ?? line.defaultVatRate ?? 8);
  const net = Math.round(line.grossAmount * 100 / (100 + rate));
  return { ...line, rate, net, vat: line.grossAmount - net };
}));
const sumNet = computed(() => calculations.value.reduce((sum, line) => sum + line.net, 0));
const sumVat = computed(() => calculations.value.reduce((sum, line) => sum + line.vat, 0));
const sumGross = computed(() => calculations.value.reduce((sum, line) => sum + line.grossAmount, 0));
const totalMatches = computed(() => sumGross.value === Number(preflight.value?.orderTotal || 0));

async function load() {
  if (!props.order?.id) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get(`/orders/${props.order.id}/vat/amis/preflight`);
    preflight.value = data;
    rates.value = Object.fromEntries((data.lines || []).map((line) => [line.itemId, line.defaultVatRate ?? 8]));
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'Không đối chiếu được dữ liệu với Actapp.';
  } finally {
    loading.value = false;
  }
}

async function createMissing() {
  saving.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.post(`/orders/${props.order.id}/vat/amis/create-missing`);
    infoMsg.value = data.message || 'MISA đã nhận yêu cầu tạo mã mới.';
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'Không tạo được danh mục trên MISA.';
  } finally {
    saving.value = false;
  }
}

async function submitExport() {
  if (!totalMatches.value) {
    errorMsg.value = 'Số tiền sau VAT không bằng tiền bán lẻ. Không thể gửi.';
    return;
  }
  saving.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.post(`/orders/${props.order.id}/vat/amis/export`, {
      lines: calculations.value.map((line) => ({ itemId: line.itemId, vatRate: line.rate })),
    });
    emit('queued', data);
    infoMsg.value = data.message || 'Đã gửi sang Actapp, đang chờ MISA xác nhận.';
    preflight.value = { ...preflight.value, pendingExport: true, canExport: false };
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'Không gửi được hóa đơn sang Actapp.';
  } finally {
    saving.value = false;
  }
}

watch(() => props.order?.id, (id) => {
  preflight.value = null;
  rates.value = {};
  errorMsg.value = '';
  infoMsg.value = '';
  if (id) load();
}, { immediate: true });
</script>

<template>
  <transition name="fade">
    <div v-if="order" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
      <div class="w-full max-w-[760px] max-h-[90vh] overflow-y-auto bg-white rounded-card shadow-pop p-5 space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-ink-primary">Xuất trên MISA Actapp</h2>
            <p class="text-[12px] text-ink-secondary mt-1">Đơn <span class="font-mono">{{ order.orderCode }}</span> · Chỉ đánh dấu đã xuất sau callback thành công.</p>
          </div>
          <button class="text-xl text-ink-secondary" @click="emit('close')">×</button>
        </div>

        <div v-if="loading" class="py-10 text-center text-sm text-ink-secondary">Đang đối chiếu khách hàng, hàng hóa và đơn vị với Actapp…</div>
        <div v-if="errorMsg" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMsg }}</div>
        <div v-if="infoMsg" class="rounded-lg border border-royal-200 bg-royal-50 px-3 py-2 text-sm text-royal-700">{{ infoMsg }}</div>

        <template v-if="preflight && !loading">
          <div class="rounded-lg border border-line-200 p-3 text-sm">
            <div class="font-semibold text-ink-primary">{{ preflight.customer.name }}</div>
            <div class="text-[12px] text-ink-secondary">Mã: {{ preflight.customer.code }} · MST/CCCD: {{ preflight.customer.taxCode || '—' }}</div>
          </div>

          <div v-if="preflight.status === 'blocked'" class="space-y-2">
            <div class="font-semibold text-red-700">Chưa thể xuất</div>
            <ul class="list-disc pl-5 text-sm text-red-700 space-y-1">
              <li v-for="message in preflight.errors" :key="message">{{ message }}</li>
            </ul>
          </div>

          <div v-else-if="preflight.status === 'missing_catalogs'" class="space-y-3">
            <div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <div class="font-semibold">Actapp chưa có mã tương ứng. Anh có muốn tạo trên MISA không?</div>
              <div v-if="preflight.missing.customer" class="mt-1">Khách hàng: {{ preflight.customer.code }} — {{ preflight.customer.name }}</div>
              <div v-if="preflight.missing.productSkus.length" class="mt-1">Hàng hóa: {{ preflight.missing.productSkus.join(', ') }}</div>
            </div>
            <div class="flex justify-end gap-2">
              <button class="h-10 px-4 rounded-btn border border-line-300 text-sm font-semibold" @click="emit('close')">Không, chưa xuất</button>
              <button class="h-10 px-4 rounded-btn bg-royal-700 text-white text-sm font-bold disabled:opacity-50" :disabled="saving" @click="createMissing">Có, tạo trên MISA</button>
              <button v-if="infoMsg" class="h-10 px-4 rounded-btn border border-royal-700 text-royal-700 text-sm font-semibold" :disabled="loading" @click="load">Đối chiếu lại</button>
            </div>
          </div>

          <template v-else-if="preflight.status === 'ready'">
            <div v-if="preflight.warnings.length" class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-800">
              <div v-for="message in preflight.warnings" :key="message">{{ message }}</div>
            </div>
            <div class="overflow-x-auto border border-line-200 rounded-lg">
              <table class="w-full text-sm">
                <thead><tr class="bg-surface-soft text-[11px] text-ink-secondary">
                  <th class="text-left px-3 py-2">HÀNG HÓA ACTAPP</th><th class="text-right px-3 py-2">SL</th>
                  <th class="text-right px-3 py-2">SAU VAT</th><th class="text-center px-3 py-2">THUẾ</th>
                  <th class="text-right px-3 py-2">TIỀN THUẾ</th>
                </tr></thead>
                <tbody><tr v-for="line in calculations" :key="line.itemId" class="border-t border-line-200">
                  <td class="px-3 py-2"><div class="font-medium">{{ line.name }}</div><div class="text-[11px] text-ink-secondary">{{ line.sku }} · {{ line.unitName }}</div></td>
                  <td class="px-3 py-2 text-right">{{ line.quantity }}</td>
                  <td class="px-3 py-2 text-right font-semibold">{{ formatVND(line.grossAmount) }}</td>
                  <td class="px-3 py-2 text-center"><select v-model.number="rates[line.itemId]" class="h-8 rounded border border-line-300 px-2 bg-white"><option :value="0">0%</option><option :value="5">5%</option><option :value="8">8%</option><option :value="10">10%</option></select></td>
                  <td class="px-3 py-2 text-right">{{ formatVND(line.vat) }}</td>
                </tr></tbody>
                <tfoot><tr class="border-t border-line-300 font-semibold">
                  <td colspan="2" class="px-3 py-2 text-right">Tổng</td><td class="px-3 py-2 text-right">{{ formatVND(sumGross) }}</td><td></td><td class="px-3 py-2 text-right">{{ formatVND(sumVat) }}</td>
                </tr></tfoot>
              </table>
            </div>
            <div class="flex items-center justify-between gap-3 rounded-lg p-3" :class="totalMatches ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'">
              <div class="text-[12px]"><div>Trước VAT: {{ formatVND(sumNet) }} · VAT: {{ formatVND(sumVat) }}</div><div class="font-semibold">Sau VAT {{ formatVND(sumGross) }} {{ totalMatches ? '= tiền bán lẻ' : '≠ tiền bán lẻ' }} {{ formatVND(preflight.orderTotal) }}</div></div>
              <button class="h-10 px-4 rounded-btn bg-royal-700 text-white text-sm font-bold disabled:opacity-50" :disabled="saving || !totalMatches || preflight.pendingExport" @click="submitExport">{{ preflight.pendingExport ? 'Đang đồng bộ' : 'Gửi sang MISA' }}</button>
            </div>
          </template>
        </template>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,.fade-leave-active { transition: opacity .2s ease; }
</style>
