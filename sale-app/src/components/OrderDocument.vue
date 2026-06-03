<script setup>
/**
 * OrderDocument.vue — Chứng từ A5 Manhae (theo spec manhae-a5-documents-v2).
 *   type='invoice'  → HÓA ĐƠN BÁN HÀNG (mã ĐH-) — có đơn giá/thành tiền + thanh toán
 *   type='handover' → BIÊN BẢN GIAO HÀNG (mã GH-) — KHÔNG giá, có cột Ghi chú
 * Pháp nhân: CÔNG TY TNHH HALOVN. Thương hiệu chính: Manhae.
 * In/PDF: nút "In" dùng window.print() (@page A5) — nét nhất. "Tải ảnh" dùng html2canvas.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import html2canvas from 'html2canvas';
import { readVND } from '../composables/useFormat';

const props = defineProps({
  order: { type: Object, required: true },
  type: { type: String, default: 'invoice' }, // invoice | handover
});
const emit = defineEmits(['close', 'done']);

const isInvoice = computed(() => props.type === 'invoice');
const docTitle = computed(() => (isInvoice.value ? ['HÓA ĐƠN', 'BÁN HÀNG'] : ['BIÊN BẢN', 'GIAO HÀNG']));
const codeLabel = computed(() => (isInvoice.value ? 'Số hóa đơn' : 'Số phiếu'));
const fileSlug = computed(() => (isInvoice.value ? 'hoa-don' : 'bien-ban'));

// Cùng số đơn, đổi tiền tố: ĐH- (hóa đơn) / GH- (biên bản).
const docCode = computed(() => {
  const base = String(props.order.order_code || '').replace(/^[A-Za-zĐ]+-/, '') || '—';
  return `${isInvoice.value ? 'ĐH' : 'GH'}-${base}`;
});

function todayVN() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const dateStr = computed(() => props.order.orderDateVN || todayVN());

const PAY_LABEL = { cod: 'COD', bank_transfer: 'Chuyển khoản', credit: 'Công nợ', cash: 'Tiền mặt' };
const fmt = new Intl.NumberFormat('vi-VN');

const items = computed(() => props.order.items || []);
const totalBoxes = computed(() => items.value.reduce((s, it) => s + (Number(it.quantity) || 0), 0));
const subtotal = computed(() => Number(props.order.subtotal) || 0);
const discount = computed(() => Number(props.order.totalDiscount) || 0);
const total = computed(() => Number(props.order.total) || 0);
const amountWords = computed(() => readVND(total.value));

const cust = computed(() => ({
  name: props.order.customerName || '—',
  company: props.order.customerCompany || '',
  taxCode: props.order.customerTaxCode || '',
  address: props.order.customerAddress || '',
  phone: props.order.customerPhone || '',
}));
const recv = computed(() => ({
  name: props.order.recipientName || props.order.customerName || '—',
  address: props.order.deliveryAddress || props.order.customerAddress || '—',
  phone: props.order.recipientPhone || props.order.customerPhone || '—',
  note: props.order.note || '—',
}));

const paper = ref(null);
const downloading = ref(false);

function onEsc(e) {
  if (e.key === 'Escape') { e.preventDefault(); emit('done'); }
}
onMounted(() => window.addEventListener('keydown', onEsc));
onUnmounted(() => window.removeEventListener('keydown', onEsc));

function printDoc() { window.print(); }

async function downloadImage() {
  if (!paper.value) return;
  downloading.value = true;
  try {
    const canvas = await html2canvas(paper.value, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileSlug.value}-${docCode.value}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="doc-overlay" @click.self="emit('done')">
    <!-- Nút thao tác (không in) -->
    <div class="doc-actions">
      <button @click="printDoc" class="btn-print" title="In / Lưu PDF">🖨 In / Lưu PDF</button>
      <button @click="downloadImage" :disabled="downloading" class="btn-ico" title="Tải ảnh PNG">⤓</button>
      <button @click="emit('close')" class="btn-ico" title="Quay lại">✕</button>
    </div>

    <div ref="paper" class="doc-paper">
      <!-- HEADER sóng -->
      <div class="dh-head">
        <svg viewBox="0 0 559 222" preserveAspectRatio="none">
          <defs>
            <linearGradient :id="`g-${type}`" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#2D0054" /><stop offset="100%" stop-color="#5B1FA6" />
            </linearGradient>
          </defs>
          <path d="M0,0 H559 V34 C497,44 458,58 373,70 C310,80 261,176 181,176 C104,176 60,176 0,184 Z" fill="#9B6FE0" opacity="0.5" />
          <path d="M0,0 H559 V20 C497,30 458,44 373,56 C310,66 261,160 181,160 C104,160 60,160 0,168 Z" :fill="`url(#g-${type})`" />
        </svg>
        <div class="dh-logo"><div class="mark">manhaē</div><div class="slogan">Sức khỏe là vẻ đẹp thật sự</div></div>
        <div class="dh-title">
          <h1>{{ docTitle[0] }}<br>{{ docTitle[1] }}</h1>
          <div class="pill-code">{{ codeLabel }}: {{ docCode }}</div>
          <div class="dh-date">Ngày: {{ dateStr }}</div>
        </div>
        <div class="dh-badge">🛡 PHÂN PHỐI CHÍNH THỨC MANHAE TẠI VIỆT NAM</div>
      </div>

      <div class="dh-body">
        <!-- Pháp nhân -->
        <div class="dh-company">
          <div class="name">CÔNG TY TNHH HALOVN</div>
          <div class="meta">MST: 0110086708<br>Thôn Thiên Lộc, Xã Trung Chính, Tỉnh Bắc Ninh, Việt Nam<br>✉ ketoanhalovn@gmail.com &nbsp; ☎ 0362431998 / 0964435197</div>
        </div>

        <!-- 2 thẻ thông tin -->
        <div class="dh-info">
          <div class="dh-card">
            <div class="ttl">👤 Thông tin khách hàng</div>
            <div class="kv">
              <span class="k">Tên khách hàng</span><span class="v">{{ cust.name }}</span>
              <template v-if="cust.company"><span class="k">Tên công ty</span><span class="v">{{ cust.company }}</span></template>
              <template v-if="cust.taxCode"><span class="k">MST</span><span class="v">{{ cust.taxCode }}</span></template>
              <span class="k">Địa chỉ</span><span class="v">{{ cust.address || '—' }}</span>
              <span class="k">SĐT</span><span class="v">{{ cust.phone || '—' }}</span>
            </div>
          </div>
          <div class="dh-card">
            <div class="ttl">🚚 Thông tin nhận hàng</div>
            <div class="kv">
              <span class="k">Người nhận</span><span class="v">{{ recv.name }}</span>
              <span class="k">Địa chỉ nhận</span><span class="v">{{ recv.address }}</span>
              <span class="k">SĐT nhận</span><span class="v">{{ recv.phone }}</span>
              <span class="k">Ghi chú giao</span><span class="v">{{ recv.note }}</span>
            </div>
          </div>
        </div>

        <!-- Bảng SP -->
        <div class="dh-sec">🛒 Chi tiết sản phẩm</div>
        <table class="dh-table">
          <thead>
            <tr>
              <th>STT</th><th class="l">Sản phẩm</th><th>SKU</th>
              <th>Số lượng<span class="u">(Hộp)</span></th>
              <template v-if="isInvoice">
                <th>Đơn giá<span class="u">(VNĐ)</span></th><th>Thành tiền<span class="u">(VNĐ)</span></th>
              </template>
              <th v-else class="l">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in items" :key="i">
              <td>{{ i + 1 }}</td>
              <td class="l">{{ it.name }}</td>
              <td>{{ it.sku }}</td>
              <td>{{ it.quantity }}</td>
              <template v-if="isInvoice">
                <td class="r">{{ fmt.format(it.unitPrice) }}</td>
                <td class="r">{{ fmt.format(it.lineTotal) }}</td>
              </template>
              <td v-else class="l"></td>
            </tr>
            <tr class="total">
              <td colspan="3">Tổng cộng</td>
              <td>{{ totalBoxes }}</td>
              <template v-if="isInvoice"><td></td><td class="r">{{ fmt.format(subtotal) }}</td></template>
              <td v-else class="l"></td>
            </tr>
          </tbody>
        </table>

        <!-- HÓA ĐƠN: thanh toán -->
        <template v-if="isInvoice">
          <div class="dh-pay">
            <div class="row"><span>Tổng tiền hàng:</span><b>{{ fmt.format(subtotal) }}đ</b></div>
            <div v-if="discount > 0" class="row"><span>Chiết khấu:</span><b>− {{ fmt.format(discount) }}đ</b></div>
            <div class="row"><span>Thuế VAT (0%):</span><b>0đ</b></div>
            <div class="total"><span>TỔNG CỘNG THANH TOÁN:</span><span>{{ fmt.format(total) }}đ</span></div>
          </div>
          <div class="dh-words"><span class="k">Bằng chữ:</span><span><i>{{ amountWords }}</i></span></div>
          <div class="dh-words"><span class="k">Hình thức thanh toán:</span><span><b>{{ PAY_LABEL[order.paymentMethod] || '—' }}</b></span></div>
        </template>

        <!-- BIÊN BẢN: tổng số hộp -->
        <template v-else>
          <div class="dh-summary">Tổng số hộp: {{ totalBoxes }}</div>
          <div class="dh-ghi">Ghi chú giao hàng: {{ order.note || '..........................................................................................' }}</div>
        </template>

        <div class="dh-grow"></div>

        <div class="dh-sign">
          <div>
            <div class="role">{{ isInvoice ? 'NGƯỜI MUA HÀNG' : 'NGƯỜI GIAO HÀNG' }}</div>
            <div class="sub">(Ký, ghi rõ họ tên)</div><div class="box"></div>
          </div>
          <div>
            <div class="role">{{ isInvoice ? 'NGƯỜI BÁN HÀNG' : 'NGƯỜI NHẬN HÀNG' }}</div>
            <div class="sub">(Ký, ghi rõ họ tên)</div><div class="box"></div>
          </div>
        </div>
        <div style="height:10px"></div>
      </div>

      <!-- FOOTER 2 dải -->
      <div class="dh-foot">
        <div class="contact"><span>🌐 www.manhae.com.vn</span><span class="sep">|</span><span>📞 081.868.5222</span><span class="sep">|</span><span>f Manhae Việt Nam</span></div>
        <div class="commit">CAM KẾT PHÂN PHỐI CHÍNH HÃNG MANHAE TẠI VIỆT NAM</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.doc-overlay{position:fixed;inset:0;z-index:60;background:rgba(20,8,40,.6);overflow:auto;
  display:flex;flex-direction:column;align-items:center;padding:64px 16px 32px;}
.doc-actions{position:fixed;top:16px;right:20px;display:flex;gap:8px;z-index:61;}
.btn-print{height:40px;padding:0 18px;border:none;border-radius:20px;background:#5B1FA6;color:#fff;
  font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 18px rgba(91,31,166,.4);font-family:inherit;}
.btn-print:hover{background:#2D0054;}
.btn-ico{width:40px;height:40px;border:none;border-radius:50%;background:#fff;color:#2D0054;font-size:18px;
  cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);}
.btn-ico:disabled{opacity:.5;}

.doc-paper{width:559px;min-height:794px;background:#fff;display:flex;flex-direction:column;
  font-family:'Be Vietnam Pro','Inter',Arial,sans-serif;color:#1F1A2E;border-radius:4px;overflow:hidden;
  box-shadow:0 16px 50px rgba(0,0,0,.4);}
.dh-body{flex:1;padding:0 26px;display:flex;flex-direction:column;}

.dh-head{position:relative;height:222px;flex-shrink:0;}
.dh-head svg{position:absolute;inset:0;width:100%;height:222px;}
.dh-logo{position:absolute;left:26px;top:40px;color:#fff;z-index:2;}
.dh-logo .mark{font-weight:300;font-size:43px;letter-spacing:2px;line-height:1;}
.dh-logo .slogan{font-size:11px;letter-spacing:.4px;opacity:.95;margin-top:6px;}
.dh-title{position:absolute;right:26px;top:56px;text-align:right;z-index:2;}
.dh-title h1{color:#2D0054;font-weight:800;font-size:32px;line-height:1.05;letter-spacing:.5px;text-transform:uppercase;}
.pill-code{display:inline-block;margin-top:12px;background:#5B1FA6;color:#fff;font-size:12px;font-weight:600;padding:6px 16px;border-radius:22px;}
.dh-date{font-size:12px;color:#4a4360;margin-top:8px;font-weight:600;}
.dh-badge{position:absolute;right:26px;top:184px;z-index:2;background:#2D0054;color:#fff;font-size:11px;font-weight:700;
  letter-spacing:.3px;padding:8px 18px;border-radius:22px;box-shadow:0 6px 16px rgba(45,0,84,.3);}

.dh-company{padding:4px 0 12px;}
.dh-company .name{color:#2D0054;font-weight:800;font-size:15px;}
.dh-company .meta{font-size:11px;color:#6B6178;line-height:1.65;margin-top:3px;}

.dh-info{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.dh-card{border:1px solid #D8C8EF;border-radius:8px;padding:12px 14px;}
.dh-card .ttl{display:flex;align-items:center;gap:7px;color:#2D0054;font-weight:700;font-size:11.5px;
  text-transform:uppercase;letter-spacing:.3px;margin-bottom:9px;}
.kv{display:grid;grid-template-columns:84px 1fr;gap:7px 8px;font-size:10.5px;line-height:1.4;}
.kv .k{color:#4B3D5A;}
.kv .v{color:#1F1A2E;font-weight:700;}

.dh-sec{display:flex;align-items:center;gap:8px;color:#2D0054;font-weight:700;font-size:12.5px;
  text-transform:uppercase;letter-spacing:.3px;margin:15px 0 8px;}
.dh-table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;border-radius:8px;overflow:hidden;}
.dh-table thead th{background:#2D0054;color:#fff;font-weight:700;padding:10px 7px;text-align:center;font-size:10.5px;line-height:1.15;}
.dh-table thead th.l{text-align:left;}
.dh-table thead th .u{display:block;font-weight:400;opacity:.78;font-size:8px;font-style:italic;}
.dh-table tbody td{padding:10px 7px;text-align:center;border-bottom:1px solid #D8C8EF;}
.dh-table tbody td.l{text-align:left;}
.dh-table tbody td.r{text-align:right;}
.dh-table tr.total td{background:#F3E8FF;font-weight:800;color:#2D0054;border:none;padding:9px 7px;}
.dh-table tr.total td.r{text-align:right;}

.dh-pay{margin-top:14px;margin-left:auto;width:58%;}
.dh-pay .row{display:flex;justify-content:space-between;font-size:12px;padding:5px 6px;color:#4a4360;}
.dh-pay .row b{color:#1F1A2E;font-weight:700;}
.dh-pay .total{display:flex;justify-content:space-between;align-items:center;background:#2D0054;color:#fff;
  border-radius:10px;padding:12px 16px;margin-top:6px;font-weight:800;font-size:14px;}
.dh-words{font-size:11.5px;margin-top:12px;color:#4a4360;display:flex;gap:10px;}
.dh-words .k{color:#6B6178;white-space:nowrap;}

.dh-summary{margin-top:12px;font-size:12.5px;color:#2D0054;font-weight:700;}
.dh-ghi{font-size:11px;color:#6B6178;margin-top:11px;}

.dh-sign{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:18px;text-align:center;}
.dh-sign .role{font-weight:800;font-size:12px;color:#1F1A2E;}
.dh-sign .sub{font-size:10px;font-style:italic;color:#6B6178;margin-top:2px;}
.dh-sign .box{height:80px;border:1px dashed #D8C8EF;border-radius:8px;margin-top:9px;}
.dh-grow{flex:1;min-height:8px;}

.dh-foot{flex-shrink:0;}
.dh-foot .contact{background:#F7F1FF;color:#2D0054;text-align:center;font-size:10px;font-weight:600;
  padding:9px 16px;display:flex;align-items:center;justify-content:center;gap:18px;}
.dh-foot .contact .sep{color:#D8C8EF;}
.dh-foot .commit{background:#2D0054;color:#fff;text-align:center;font-size:9.5px;font-weight:700;letter-spacing:.4px;padding:7px;}
</style>

<!-- Print: chỉ in tờ chứng từ, khổ A5 -->
<style>
@media print {
  @page { size: A5 portrait; margin: 0; }
  body * { visibility: hidden !important; }
  .doc-overlay, .doc-overlay * { visibility: visible !important; }
  .doc-overlay { position: absolute !important; inset: 0 !important; background: #fff !important; padding: 0 !important; display: block !important; }
  .doc-actions { display: none !important; }
  .doc-paper { width: 148mm !important; min-height: 210mm !important; box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; }
  html, body { background: #fff !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
</style>
