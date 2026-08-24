<script setup>
/**
 * VatViewDialog — "Xem hoá đơn VAT" (nút con mắt trên dòng đơn đã xuất).
 *
 * Xem nhanh file hoá đơn đã ký + nút mở/tải về để gửi khách, kèm số hoá đơn và
 * mã tra cứu (khách tự tra trên web nhà cung cấp).
 *
 * File nằm trên Supabase Storage (bucket public) nên xem trực tiếp bằng <iframe>.
 * File XML không xem được trong trình duyệt → chỉ hiện nút tải về.
 */
import { ref, computed, watch } from 'vue';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';

const props = defineProps({
  order: { type: Object, default: null }, // { id, orderCode } — null = đóng
});
const emit = defineEmits(['close']);

const loading = ref(false);
const errorMsg = ref('');
const invoices = ref([]);
const activeIdx = ref(0);

const active = computed(() => invoices.value[activeIdx.value] || null);
const isPdf = computed(() => /\.pdf($|\?)/i.test(active.value?.fileUrl || ''));

watch(
  () => props.order?.id,
  async (id) => {
    if (!id) return;
    loading.value = true;
    errorMsg.value = '';
    invoices.value = [];
    activeIdx.value = 0;
    try {
      const { data } = await api.get(`/orders/${id}/vat-invoices`);
      invoices.value = data.invoices || [];
      if (!invoices.value.length) errorMsg.value = 'Đơn này chưa có hoá đơn nào.';
    } catch (err) {
      errorMsg.value = err?.response?.data?.error || 'Không tải được hoá đơn.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function dmy(d) {
  return String(d || '').slice(0, 10).split('-').reverse().join('/');
}

// Sao chép mã tra cứu cho nhanh khi khách hỏi.
const copied = ref(false);
async function copyLookup() {
  try {
    await navigator.clipboard.writeText(active.value.lookupCode);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}

/**
 * Soạn sẵn tin nhắn gửi khách → sale dán thẳng vào Zalo của mình.
 *
 * Cố ý KHÔNG gửi tự động qua Zalo: kiểm tra production 24/8/2026 cho thấy 0/356
 * khách có `zalo_uid`, 0 hội thoại gắn khách, 2 tài khoản Zalo đều `qr_pending`
 * (mất kết nối từ 5/2026) → nút gửi tự động sẽ bấm mà không tới được ai. Khi nào
 * kênh Zalo sống lại thì nâng cấp thành gửi thẳng (zca-js có hỗ trợ đính kèm file).
 */
const msgCopied = ref(false);
const customerMessage = computed(() => {
  const inv = active.value;
  if (!inv) return '';
  const lines = [
    'Kính gửi Quý khách,',
    `HaloVN xin gửi hoá đơn VAT cho đơn hàng ${props.order?.orderCode || ''}.`,
    `- Số hoá đơn: ${inv.invoiceNumber}`,
    `- Ngày xuất: ${dmy(inv.invoiceDate)}`,
    `- Giá trị: ${formatVND(inv.amount)}`,
  ];
  if (inv.lookupCode) lines.push(`- Mã tra cứu: ${inv.lookupCode}`);
  if (inv.fileUrl) lines.push(`- Tải hoá đơn: ${inv.fileUrl}`);
  lines.push('Quý khách kiểm tra giúp em, có gì cần chỉnh sửa báo lại em ngay ạ. Em cảm ơn!');
  return lines.join('\n');
});

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(customerMessage.value);
    msgCopied.value = true;
    setTimeout(() => (msgCopied.value = false), 2000);
  } catch {
    // Trình duyệt chặn clipboard (thường do không phải HTTPS) → hiện sẵn text
    // để sale bôi đen copy tay, không để bấm xong không có gì xảy ra.
    window.prompt('Sao chép tin nhắn gửi khách:', customerMessage.value);
  }
}
</script>

<template>
  <transition name="fade">
    <div
      v-if="order"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-[760px] bg-white rounded-card shadow-pop flex flex-col max-h-[92vh]">
        <div class="px-5 py-3.5 border-b border-line-200 flex items-center justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <div class="text-base font-bold text-ink-primary">Hoá đơn VAT</div>
            <div class="text-[12px] text-ink-secondary truncate">
              Đơn <span class="font-mono">{{ order.orderCode }}</span>
            </div>
          </div>
          <button
            @click="emit('close')"
            class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary shrink-0"
            aria-label="Đóng"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-if="loading" class="h-[420px] bg-surface-soft animate-pulse rounded-card"></div>

          <div v-else-if="errorMsg" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-800">
            {{ errorMsg }}
          </div>

          <template v-else-if="active">
            <!-- Nhiều hoá đơn (xuất một phần) → chọn từng cái -->
            <div v-if="invoices.length > 1" class="flex flex-wrap gap-1.5">
              <button
                v-for="(inv, i) in invoices"
                :key="inv.id"
                @click="activeIdx = i"
                class="h-8 px-3 rounded-lg border text-[12px] font-semibold transition"
                :class="i === activeIdx
                  ? 'border-royal-700 bg-royal-50 text-royal-700'
                  : 'border-line-300 text-ink-secondary hover:border-royal-700'"
              >
                HĐ {{ inv.invoiceNumber }} · {{ formatVND(inv.amount) }}
              </button>
            </div>

            <div class="rounded-card border border-line-200 p-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
              <div>
                <div class="text-ink-secondary">Số hoá đơn</div>
                <div class="font-semibold text-ink-primary">{{ active.invoiceNumber }}</div>
              </div>
              <div>
                <div class="text-ink-secondary">Ngày xuất</div>
                <div class="font-semibold text-ink-primary">{{ dmy(active.invoiceDate) }}</div>
              </div>
              <div>
                <div class="text-ink-secondary">Giá trị</div>
                <div class="font-semibold text-royal-700">{{ formatVND(active.amount) }}</div>
              </div>
              <div>
                <div class="text-ink-secondary">Mã tra cứu</div>
                <button
                  v-if="active.lookupCode"
                  @click="copyLookup"
                  class="font-mono font-semibold text-ink-primary hover:text-royal-700"
                  title="Bấm để sao chép"
                >
                  {{ copied ? 'Đã chép!' : active.lookupCode }}
                </button>
                <div v-else class="text-ink-disabled">—</div>
              </div>
            </div>

            <!-- Xem nhanh file đã ký -->
            <div v-if="active.fileUrl" class="rounded-card border border-line-200 overflow-hidden">
              <iframe
                v-if="isPdf"
                :src="active.fileUrl"
                class="w-full h-[420px] bg-surface-soft"
                title="Hoá đơn VAT"
              ></iframe>
              <div v-else class="p-6 text-center text-[13px] text-ink-secondary">
                File XML không xem trực tiếp được — bấm "Mở / Tải hoá đơn" để tải về.
              </div>
            </div>
            <div v-else class="rounded-lg bg-surface-soft px-3 py-6 text-center text-[13px] text-ink-secondary">
              Hoá đơn này không có file đính kèm.
            </div>

            <div v-if="active.note" class="text-[12px] text-ink-secondary">Ghi chú: {{ active.note }}</div>
          </template>
        </div>

        <div class="px-5 py-3 border-t border-line-200 flex flex-wrap gap-2 justify-end shrink-0">
          <button
            @click="emit('close')"
            class="h-10 px-4 rounded-btn border border-line-300 text-sm font-semibold text-ink-secondary hover:bg-surface-soft transition"
          >
            Đóng
          </button>
          <button
            v-if="active"
            @click="copyMessage"
            class="h-10 px-4 rounded-btn border border-royal-700 text-royal-700 text-sm font-semibold hover:bg-royal-50 transition flex items-center gap-2"
            title="Chép sẵn tin nhắn kèm link hoá đơn để dán vào Zalo gửi khách"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            {{ msgCopied ? 'Đã chép — dán vào Zalo' : 'Sao chép tin nhắn gửi khách' }}
          </button>
          <a
            v-if="active?.fileUrl"
            :href="active.fileUrl"
            target="_blank"
            rel="noopener"
            class="h-10 px-4 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-bold shadow-pop transition flex items-center gap-2"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Mở / Tải hoá đơn
          </a>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
