<script setup>
/**
 * SalesDocument.vue — Chứng từ A4 đen-trắng theo mẫu kế toán (anh Philip gửi).
 *   type='export'   → PHIẾU XUẤT KHO BÁN HÀNG (8 cột, có đơn giá + VAT)
 *   type='handover' → BIÊN BẢN BÀN GIAO (5 cột, không giá)
 * Header đổi theo pháp nhân đã chọn: HaloVN / Inocare (xem useCompanies.js).
 * VAT để TRỐNG cho kế toán điền tay (theo yêu cầu).
 * In/PDF: window.print() (@page A4) — nét nhất. "Tải ảnh" dùng html2canvas.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import html2canvas from 'html2canvas';
import { readVND } from '../composables/useFormat';
import { getCompany, COMPANY_LIST } from '../composables/useCompanies';

const props = defineProps({
  order: { type: Object, required: true },
  type: { type: String, default: 'export' }, // export | handover
  companyKey: { type: String, default: 'halovn' },
});
const emit = defineEmits(['close', 'done']);

// Cho phép đổi loại phiếu ngay trên popup (in cả 2 phiếu không cần đóng lại).
const activeType = ref(props.type === 'handover' ? 'handover' : 'export');
const isExport = computed(() => activeType.value === 'export');
const fileSlug = computed(() => (isExport.value ? 'phieu-xuat-kho' : 'bien-ban-ban-giao'));

// Cho phép đổi pháp nhân ngay trên phiếu (phòng khi chọn nhầm / đơn nháp).
const activeKey = ref(props.companyKey || 'halovn');
const co = computed(() => getCompany(activeKey.value));

const fmt = new Intl.NumberFormat('vi-VN');
const fillNum = (n) => (Number(n) > 0 ? fmt.format(Number(n)) : '');

function todayVN() {
  const d = new Date();
  return { d: d.getDate(), m: d.getMonth() + 1, y: d.getFullYear() };
}
const t = todayVN();

const docNo = computed(() => props.order.order_code || '');
const items = computed(() => props.order.items || []);
const totalQty = computed(() => items.value.reduce((s, it) => s + (Number(it.quantity) || 0), 0));
const subtotal = computed(() => Number(props.order.subtotal) || 0);
const total = computed(() => Number(props.order.total) || 0);
const amountWords = computed(() => readVND(total.value));

// Số dòng tối thiểu để bảng giống form in sẵn (kẻ ô trống cho đẹp).
const MIN_ROWS = computed(() => (isExport.value ? 6 : 9));
const padRows = computed(() => Math.max(0, MIN_ROWS.value - items.value.length));

const cust = computed(() => ({
  name: props.order.customerName || '',
  address: props.order.customerAddress || '',
  phone: props.order.customerPhone || '',
  sale: props.order.saleName || '',
  deliver: props.order.deliveryAddress || props.order.customerAddress || '',
  note: props.order.note || '',
}));

const paper = ref(null);
const downloading = ref(false);

// ESC = quay lại (không đóng hẳn, tránh mất chỗ chọn phiếu kia).
function onEsc(e) {
  if (e.key === 'Escape') { e.preventDefault(); emit('close'); }
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
    link.download = `${fileSlug.value}-${docNo.value || 'don'}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <!-- Click ra ngoài KHÔNG tự tắt — chỉ đóng bằng nút "Quay lại". -->
  <div class="doc-overlay">
    <!-- Thanh thao tác (không in) -->
    <div class="doc-actions">
      <button @click="emit('close')" class="btn-back" title="Quay lại">← Quay lại</button>
      <!-- Đổi loại phiếu ngay tại đây để in cả 2 mà không cần đóng popup -->
      <div class="co-switch">
        <button
          @click="activeType = 'export'"
          :class="['co-btn', { on: isExport }]"
        >Phiếu xuất kho</button>
        <button
          @click="activeType = 'handover'"
          :class="['co-btn', { on: !isExport }]"
        >Biên bản bàn giao</button>
      </div>
      <div class="co-switch">
        <button
          v-for="c in COMPANY_LIST"
          :key="c.key"
          @click="activeKey = c.key"
          :class="['co-btn', { on: activeKey === c.key }]"
        >{{ c.short }}</button>
      </div>
      <button @click="printDoc" class="btn-print" title="In / Lưu PDF">🖨 In / Lưu PDF</button>
      <button @click="downloadImage" :disabled="downloading" class="btn-ico" title="Tải ảnh PNG">⤓</button>
    </div>

    <div ref="paper" class="page">
      <!-- ===== HEADER PHÁP NHÂN ===== -->
      <div class="org">
        <div class="org-name">{{ co.name }}</div>
        <div class="org-addr">{{ co.address }}</div>
        <div v-if="co.taxCode || co.phone || co.email" class="org-meta">
          <template v-if="co.taxCode">MST: {{ co.taxCode }}</template>
          <template v-if="co.phone"> &nbsp;·&nbsp; ĐT: {{ co.phone }}</template>
          <template v-if="co.email"> &nbsp;·&nbsp; {{ co.email }}</template>
        </div>
      </div>

      <!-- =========================================================== -->
      <!-- ===================  PHIẾU XUẤT KHO  ======================= -->
      <!-- =========================================================== -->
      <template v-if="isExport">
        <h1 class="title">PHIẾU XUẤT KHO BÁN HÀNG</h1>
        <div class="subline"><i>Ngày {{ t.d }} tháng {{ t.m }} năm {{ t.y }}</i></div>
        <div class="subline">Số: {{ docNo }}</div>

        <div class="info">
          <div class="row">
            <span class="lbl">Tên khách hàng:</span>
            <span class="val">{{ cust.name }}</span>
            <span class="lbl r">Loại tiền:</span>
            <span class="val sm">VNĐ</span>
          </div>
          <div class="row"><span class="lbl">Địa chỉ:</span><span class="val grow">{{ cust.address }}</span></div>
          <div class="row"><span class="lbl">Số điện thoại:</span><span class="val grow">{{ cust.phone }}</span></div>
          <div class="row"><span class="lbl">Diễn giải:</span><span class="val grow">{{ cust.note }}</span></div>
          <div class="row"><span class="lbl">Nhân viên bán hàng:</span><span class="val grow">{{ cust.sale }}</span></div>
          <div class="row"><span class="lbl">Địa điểm giao hàng:</span><span class="val grow">{{ cust.deliver }}</span></div>
        </div>

        <table class="dtable">
          <colgroup>
            <col style="width:6%" /><col style="width:13%" /><col style="width:26%" /><col style="width:9%" />
            <col style="width:12%" /><col style="width:9%" /><col style="width:11%" /><col style="width:14%" />
          </colgroup>
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã hàng</th>
              <th>Tên hàng</th>
              <th>Đơn vị</th>
              <th>Số Lô &amp; Date</th>
              <th>Số lượng</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in items" :key="i">
              <td class="c">{{ i + 1 }}</td>
              <td>{{ it.sku }}</td>
              <td class="l">{{ it.name }}</td>
              <td class="c">{{ it.unit }}</td>
              <td></td>
              <td class="c">{{ it.quantity }}</td>
              <td class="r">{{ fmt.format(it.unitPrice) }}</td>
              <td class="r">{{ fmt.format(it.lineTotal) }}</td>
            </tr>
            <tr v-for="n in padRows" :key="'p' + n" class="empty">
              <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          </tbody>
        </table>

        <!-- Khối tổng tiền (div thay tfoot để colspan luôn căn đúng cột) -->
        <div class="totbox">
          <div class="totrow">
            <div class="totlabel b">Cộng</div>
            <div class="totval b">{{ fmt.format(subtotal) }}</div>
          </div>
          <div class="totrow">
            <div class="totlabel c">Cộng tiền hàng</div>
            <div class="totval b">{{ fmt.format(subtotal) }}</div>
          </div>
          <div class="totrow">
            <div class="totlabel split">
              <span>Thuế suất thuế GTGT: ........ %</span>
              <span class="taxlbl">Tiền thuế GTGT:</span>
            </div>
            <div class="totval"></div>
          </div>
          <div class="totrow">
            <div class="totlabel c b">Tổng tiền thanh toán</div>
            <div class="totval b">{{ fmt.format(total) }}</div>
          </div>
        </div>

        <div class="words"><span class="lbl">Số tiền bằng chữ:</span> <i>{{ amountWords }}</i></div>

        <div class="sign sign-3">
          <div><div class="role">Người lập phiếu</div><div class="sub">(Ký, ghi rõ họ tên)</div></div>
          <div><div class="role">Người nhận hàng</div><div class="sub">(Ký, ghi rõ họ tên)</div></div>
          <div><div class="role">Thủ kho</div><div class="sub">(Ký, ghi rõ họ tên)</div></div>
        </div>
      </template>

      <!-- =========================================================== -->
      <!-- ===================  BIÊN BẢN BÀN GIAO  ==================== -->
      <!-- =========================================================== -->
      <template v-else>
        <h1 class="title">BIÊN BẢN BÀN GIAO</h1>

        <div class="info hb">
          <div class="row"><span>Ngày {{ t.d }} tháng {{ t.m }} năm {{ t.y }} tại</span><span class="val grow">{{ cust.deliver }}</span></div>
          <div class="row"><span class="lbl">Đại diện bên nhận (Bên A):</span><span class="val grow">{{ cust.name }}</span></div>
          <div class="row"><span class="lbl">Đại diện bên giao (Bên B):</span><span class="val grow b">{{ co.name }}</span></div>
          <div class="row"><span class="lbl">Số điện thoại:</span><span class="val grow">{{ cust.phone }}</span></div>
          <div class="row"><span class="lbl">Nhân viên bán hàng:</span><span class="val grow">{{ cust.sale }}</span></div>
          <div class="row"><span class="lbl">Địa điểm giao hàng:</span><span class="val grow">{{ cust.deliver }}</span></div>
        </div>

        <div class="handover-lead">Bên B đã bàn giao cho bên A:</div>

        <table class="dtable">
          <colgroup>
            <col style="width:8%" /><col style="width:44%" /><col style="width:14%" /><col style="width:18%" /><col style="width:16%" />
          </colgroup>
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên hàng</th>
              <th>ĐVT</th>
              <th>Số Lô &amp; Date</th>
              <th>Số lượng</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in items" :key="i">
              <td class="c">{{ i + 1 }}</td>
              <td class="l">{{ it.name }}</td>
              <td class="c">{{ it.unit }}</td>
              <td></td>
              <td class="c">{{ it.quantity }}</td>
            </tr>
            <tr v-for="n in padRows" :key="'p' + n" class="empty">
              <td>&nbsp;</td><td></td><td></td><td></td><td></td>
            </tr>
          </tbody>
        </table>

        <div class="note-line"><i>Xin Quý khách vui lòng ký ghi rõ họ tên trên biên bản sau khi đã nhận đủ hàng.</i></div>

        <div class="sign sign-2">
          <div><div class="role">ĐẠI DIỆN BÊN NHẬN</div><div class="sub">(Ký, họ tên)</div></div>
          <div><div class="role">ĐẠI DIỆN BÊN GIAO</div><div class="sub">(Ký, họ tên)</div></div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.doc-overlay{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.6);overflow:auto;
  display:flex;flex-direction:column;align-items:center;padding:72px 16px 40px;}
.doc-actions{position:fixed;top:16px;right:20px;display:flex;align-items:center;gap:8px;z-index:61;}
.co-switch{display:flex;background:#fff;border-radius:20px;padding:3px;box-shadow:0 4px 12px rgba(0,0,0,.2);}
.co-btn{border:none;background:transparent;color:#475569;font-weight:700;font-size:13px;
  padding:6px 14px;border-radius:18px;cursor:pointer;font-family:inherit;}
.co-btn.on{background:#1d4ed8;color:#fff;}
.btn-print{height:40px;padding:0 18px;border:none;border-radius:20px;background:#1d4ed8;color:#fff;
  font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 18px rgba(29,78,216,.4);font-family:inherit;}
.btn-print:hover{background:#1e40af;}
.btn-ico{width:40px;height:40px;border:none;border-radius:50%;background:#fff;color:#1e293b;font-size:18px;
  cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);}
.btn-ico:disabled{opacity:.5;}
.btn-back{height:40px;padding:0 16px;border:none;border-radius:20px;background:#fff;color:#1e293b;
  font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);font-family:inherit;}
.btn-back:hover{background:#f1f5f9;}

/* Tờ A4: 210 x 297mm → 720 x 1018px trên màn hình */
.page{width:720px;min-height:1018px;background:#fff;color:#111;padding:34px 40px 30px;
  box-sizing:border-box;box-shadow:0 16px 50px rgba(0,0,0,.4);
  font-family:'Times New Roman',Times,serif;font-size:14px;line-height:1.4;}

/* ===== Header pháp nhân ===== */
.org-name{font-weight:700;font-size:16px;text-transform:uppercase;}
.org-addr{font-size:13.5px;font-style:italic;margin-top:2px;}
.org-meta{font-size:12.5px;margin-top:2px;color:#222;}

/* ===== Tiêu đề ===== */
.title{text-align:center;font-weight:700;font-size:26px;letter-spacing:.5px;
  text-transform:uppercase;margin:14px 0 4px;}
.subline{text-align:center;font-size:14px;}

/* ===== Khối thông tin ===== */
.info{margin-top:12px;}
.info.hb{margin-top:16px;}
.info .row{display:flex;align-items:flex-end;gap:6px;margin-bottom:5px;min-height:20px;}
.info .lbl{white-space:nowrap;}
.info .lbl.r{margin-left:auto;}
.info .val{font-weight:700;}
.info .val.sm{min-width:80px;}
.info .val.grow{flex:1;border-bottom:1px dotted #999;}
.info .row > span:not(.lbl):not(.val){white-space:nowrap;}
.info .val.b{font-weight:700;}

/* ===== Bảng ===== */
.dtable{width:100%;border-collapse:collapse;margin-top:12px;font-size:13.5px;}
.dtable th,.dtable td{border:1px solid #000;padding:5px 6px;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;}
.dtable th{text-align:center;font-weight:700;background:#fff;}
.dtable td.c{text-align:center;}
.dtable td.l{text-align:left;}
.dtable td.r{text-align:right;}
.dtable td.b{font-weight:700;}
.dtable tr.empty td{height:24px;}

/* Khối tổng tiền — div căn theo cột Thành tiền (14% bên phải) */
.totbox{border:1px solid #000;border-top:none;font-size:13.5px;}
.totrow{display:flex;align-items:stretch;}
.totrow:not(:last-child){border-bottom:1px solid #000;}
.totlabel{flex:1;padding:6px 8px;text-align:left;}
.totlabel.c{text-align:center;}
.totlabel.b,.totval.b{font-weight:700;}
.totlabel.split{display:flex;padding:0;}
.totlabel.split > span{flex:1;padding:6px 8px;}
.totlabel.split .taxlbl{flex:0 0 42%;border-left:1px solid #000;}
.totval{flex:0 0 14%;padding:6px 8px;text-align:right;border-left:1px solid #000;}

.words{margin-top:10px;}
.words .lbl{font-weight:400;}

.handover-lead{margin-top:14px;font-weight:700;}
.note-line{text-align:center;margin-top:18px;font-size:13.5px;}

/* ===== Chữ ký ===== */
.sign{display:grid;margin-top:28px;text-align:center;gap:20px;}
.sign-3{grid-template-columns:repeat(3,1fr);}
.sign-2{grid-template-columns:repeat(2,1fr);padding:0 8%;}
.sign .role{font-weight:700;font-size:14px;}
.sign .sub{font-style:italic;font-size:12.5px;margin-top:1px;}
</style>

<!-- In: chỉ tờ chứng từ, khổ A4 dọc -->
<style>
@media print {
  @page { size: A4 portrait; margin: 0; }
  body * { visibility: hidden !important; }
  .doc-overlay, .doc-overlay * { visibility: visible !important; }
  .doc-overlay { position: absolute !important; inset: 0 !important; background: #fff !important; padding: 0 !important; display: block !important; }
  .doc-actions { display: none !important; }
  .doc-overlay .page { width: 210mm !important; min-height: 297mm !important; box-shadow: none !important; margin: 0 !important; padding: 14mm 14mm 10mm !important; }
  html, body { background: #fff !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
</style>
