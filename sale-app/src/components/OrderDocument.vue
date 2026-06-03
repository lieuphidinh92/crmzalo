<script setup>
/**
 * OrderDocument.vue — Phiếu A4 cho đơn hàng, 2 loại:
 *  - type='invoice'  → HOÁ ĐƠN BÁN HÀNG (PHIẾU MUA HÀNG) — có công nợ / tổng phải thu
 *  - type='handover' → BIÊN BẢN BÀN GIAO — chỉ xác nhận giao đủ hàng (bỏ công nợ)
 * Dựng theo mẫu nds. Dùng inline-style để html2canvas render ổn định.
 */
import { ref, onMounted, onUnmounted } from 'vue';
import html2canvas from 'html2canvas';
import { formatVND } from '../composables/useFormat';

const props = defineProps({
  order: { type: Object, required: true },
  type: { type: String, default: 'invoice' }, // invoice | handover
});
// 'close' → quay lại modal tóm tắt (nút ✕). 'done' → đóng hẳn + tạo đơn mới (ESC / click ngoài).
const emit = defineEmits(['close', 'done']);

function onEsc(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('done');
  }
}
onMounted(() => window.addEventListener('keydown', onEsc));
onUnmounted(() => window.removeEventListener('keydown', onEsc));

const paper = ref(null);
const downloading = ref(false);

const NAVY = '#13315c';
const AMBER = '#d97706';

const isInvoice = props.type === 'invoice';
const docTitle = isInvoice ? 'PHIẾU MUA HÀNG' : 'BIÊN BẢN BÀN GIAO';
const fileSlug = isInvoice ? 'hoa-don' : 'bien-ban';

const PAY_LABEL = { cod: 'COD', bank_transfer: 'Chuyển khoản', credit: 'Công nợ' };

function todayVN() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const dateStr = props.order.orderDateVN || todayVN();
const statusStr =
  props.order.status === 'draft' ? 'Nháp (lưu tạm)' : 'Đã xác nhận';

async function downloadImage() {
  if (!paper.value) return;
  downloading.value = true;
  try {
    const canvas = await html2canvas(paper.value, { scale: 2, backgroundColor: '#ffffff' });
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileSlug}-${props.order.order_code || 'don-hang'}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <!-- ESC / click ra ngoài phiếu → 'done' (đóng + tạo đơn mới) -->
  <div class="fixed inset-0 z-[60] bg-black/50 overflow-auto px-4 pt-16 pb-8" @click.self="emit('done')">
    <div class="relative mx-auto" style="width: 760px; max-width: 100%;" @click.self="emit('done')">
      <!-- Nút icon sát lề trên-phải phiếu (không in/không chụp) -->
      <div class="absolute -top-12 right-0 flex items-center gap-2">
        <button
          @click="downloadImage"
          :disabled="downloading"
          title="Tải ảnh"
          class="w-10 h-10 rounded-full bg-royal-700 hover:bg-royal-800 text-white shadow-lg flex items-center justify-center disabled:opacity-50"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" />
          </svg>
        </button>
        <button
          @click="emit('close')"
          title="Đóng"
          class="w-10 h-10 rounded-full bg-white text-ink-primary shadow-lg flex items-center justify-center hover:bg-surface-50"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        ref="paper"
        :style="{ width: '760px', maxWidth: '100%', background: '#fff', padding: '36px 40px', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a1a', borderRadius: '6px' }"
      >
        <!-- Header -->
        <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${NAVY}`, paddingBottom: '14px' }">
          <div :style="{ display: 'flex', gap: '12px', alignItems: 'center' }">
            <div :style="{ width: '60px', height: '60px', borderRadius: '12px', background: NAVY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '22px', letterSpacing: '0.5px' }">nds</div>
            <div>
              <div :style="{ fontSize: '20px', fontWeight: '800', color: NAVY }">Nghề Dược Sĩ</div>
              <div :style="{ fontSize: '11px', fontStyle: 'italic', color: '#555' }">Nơi nghề dược sĩ cất lời.</div>
              <div :style="{ fontSize: '10px', color: '#777', marginTop: '2px' }">CỘNG ĐỒNG DƯỢC SĨ • SÀN SỈ DƯỢC PHẨM &amp; TPCN</div>
              <div :style="{ fontSize: '10px', color: '#777', marginTop: '1px' }">🌐 ngheduocsi.vn &nbsp; ☎ Hotline: 0888 888 888</div>
            </div>
          </div>
          <div :style="{ textAlign: 'right' }">
            <div :style="{ fontSize: '22px', fontWeight: '800', color: NAVY }">{{ docTitle }}</div>
            <div :style="{ fontSize: '12px', color: '#555', marginTop: '4px' }">
              Số phiếu: <span :style="{ color: AMBER, fontWeight: '700' }">{{ order.order_code || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Info row -->
        <div :style="{ display: 'flex', gap: '10px', margin: '16px 0' }">
          <div :style="{ flex: '1', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px' }">
            <div :style="{ fontSize: '10px', color: '#888' }">Ngày đặt hàng</div>
            <div :style="{ fontSize: '13px', fontWeight: '700' }">{{ dateStr }}</div>
          </div>
          <div :style="{ flex: '1', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px' }">
            <div :style="{ fontSize: '10px', color: '#888' }">Chuyên viên phụ trách</div>
            <div :style="{ fontSize: '13px', fontWeight: '700' }">{{ order.saleName || '—' }}</div>
          </div>
          <div :style="{ flex: '1', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px' }">
            <div :style="{ fontSize: '10px', color: '#888' }">Trạng thái</div>
            <div :style="{ fontSize: '13px', fontWeight: '700' }">{{ statusStr }}</div>
          </div>
        </div>

        <!-- Khách hàng -->
        <div :style="{ marginBottom: '12px' }">
          <div :style="{ fontSize: '13px', fontWeight: '800', color: NAVY, marginBottom: '4px' }">👤 THÔNG TIN KHÁCH HÀNG</div>
          <div :style="{ fontSize: '15px', fontWeight: '700' }">{{ order.recipientName || order.customerName || '—' }}</div>
          <div :style="{ fontSize: '12px', color: '#555', marginTop: '2px' }">SĐT: {{ order.recipientPhone || order.customerPhone || '—' }}</div>
          <div v-if="order.deliveryAddress" :style="{ fontSize: '12px', color: '#555', marginTop: '2px' }">Địa chỉ: {{ order.deliveryAddress }}</div>
        </div>

        <!-- Bảng SP -->
        <div :style="{ fontSize: '13px', fontWeight: '800', color: NAVY, marginBottom: '6px' }">🛒 CHI TIẾT SẢN PHẨM</div>
        <table :style="{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }">
          <thead>
            <tr :style="{ background: NAVY, color: '#fff' }">
              <th :style="{ padding: '8px 6px', textAlign: 'center', width: '34px' }">STT</th>
              <th :style="{ padding: '8px 8px', textAlign: 'left' }">Tên sản phẩm</th>
              <th :style="{ padding: '8px 6px', textAlign: 'center', width: '70px' }">SKU</th>
              <th :style="{ padding: '8px 6px', textAlign: 'center', width: '46px' }">Lô</th>
              <th :style="{ padding: '8px 6px', textAlign: 'center', width: '50px' }">SL</th>
              <th :style="{ padding: '8px 6px', textAlign: 'right', width: '90px' }">Đơn giá</th>
              <th v-if="isInvoice" :style="{ padding: '8px 8px', textAlign: 'right', width: '100px' }">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, idx) in order.items" :key="idx" :style="{ borderBottom: '1px solid #e5e7eb' }">
              <td :style="{ padding: '8px 6px', textAlign: 'center' }">{{ idx + 1 }}</td>
              <td :style="{ padding: '8px 8px' }">{{ it.name }}</td>
              <td :style="{ padding: '8px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }">{{ it.sku }}</td>
              <td :style="{ padding: '8px 6px', textAlign: 'center', color: '#999' }">–</td>
              <td :style="{ padding: '8px 6px', textAlign: 'center' }">{{ it.quantity }}<span :style="{ fontSize: '10px', color: '#999' }"> {{ it.unit || 'Hộp' }}</span></td>
              <td :style="{ padding: '8px 6px', textAlign: 'right' }">{{ formatVND(it.unitPrice) }}</td>
              <td v-if="isInvoice" :style="{ padding: '8px 8px', textAlign: 'right', fontWeight: '600' }">{{ formatVND(it.lineTotal) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Tổng tiền (chỉ hoá đơn) -->
        <template v-if="isInvoice">
          <div :style="{ marginTop: '14px', borderTop: '1px solid #e5e7eb' }">
            <div :style="{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: '13px' }">
              <span :style="{ color: '#555' }">Tổng tiền hàng:</span><span :style="{ fontWeight: '700' }">{{ formatVND(order.subtotal) }}</span>
            </div>
            <div v-if="order.totalDiscount > 0" :style="{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: '13px' }">
              <span :style="{ color: '#555' }">Chiết khấu:</span><span :style="{ fontWeight: '700', color: '#059669' }">− {{ formatVND(order.totalDiscount) }}</span>
            </div>
            <div v-if="order.shippingFee > 0" :style="{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: '13px' }">
              <span :style="{ color: '#555' }">Phí ship:</span><span :style="{ fontWeight: '700' }">{{ formatVND(order.shippingFee) }}</span>
            </div>
            <div :style="{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: '13px' }">
              <span :style="{ color: '#555' }">Đã thanh toán:</span><span :style="{ fontWeight: '700' }">{{ formatVND(order.paid) }}</span>
            </div>
            <div :style="{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: '13px' }">
              <span :style="{ color: '#dc2626' }">Còn nợ:</span><span :style="{ fontWeight: '700', color: '#dc2626' }">{{ formatVND(order.debt) }}</span>
            </div>
          </div>
          <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: NAVY, color: '#fff', borderRadius: '8px', padding: '12px 16px', marginTop: '8px', fontSize: '15px', fontWeight: '800' }">
            <span>TỔNG PHẢI THU:</span><span>{{ formatVND(order.total) }}</span>
          </div>
          <div :style="{ marginTop: '12px', fontSize: '12px' }">
            <span :style="{ color: '#555' }">💲 Hình thức thanh toán: </span>
            <span :style="{ fontWeight: '700' }">{{ PAY_LABEL[order.paymentMethod] || '—' }}</span>
          </div>
        </template>

        <!-- Biên bản: dòng xác nhận -->
        <div v-else :style="{ marginTop: '14px', fontSize: '12px', color: '#444', fontStyle: 'italic' }">
          Bên giao đã giao đủ số lượng sản phẩm như liệt kê ở trên. Bên nhận đã kiểm tra
          và xác nhận nhận đủ hàng, đúng quy cách.
        </div>

        <!-- Chữ ký -->
        <div :style="{ display: 'flex', justifyContent: 'space-around', marginTop: '28px', textAlign: 'center' }">
          <div :style="{ width: '45%' }">
            <div :style="{ fontSize: '12px', fontWeight: '700' }">NGƯỜI GIAO HÀNG</div>
            <div :style="{ fontSize: '10px', fontStyle: 'italic', color: '#888' }">(Ký, ghi rõ họ tên)</div>
            <div :style="{ borderBottom: '1px dotted #aaa', marginTop: '48px' }"></div>
          </div>
          <div :style="{ width: '45%' }">
            <div :style="{ fontSize: '12px', fontWeight: '700' }">NGƯỜI NHẬN HÀNG</div>
            <div :style="{ fontSize: '10px', fontStyle: 'italic', color: '#888' }">(Ký, ghi rõ họ tên)</div>
            <div :style="{ borderBottom: '1px dotted #aaa', marginTop: '48px' }"></div>
          </div>
        </div>

        <!-- Footer -->
        <div :style="{ marginTop: '24px', background: '#f5f7fa', borderRadius: '8px', padding: '12px 14px', fontSize: '11px', color: '#666' }">
          💚 Cảm ơn quý khách đã đồng hành cùng Nghề Dược Sĩ. Mọi thắc mắc vui lòng liên hệ Sale phụ trách.
        </div>
      </div>
    </div>
  </div>
</template>
