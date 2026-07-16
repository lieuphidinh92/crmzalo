<script setup>
/**
 * SalesDocument.vue — Chứng từ A4 theo bộ nhận diện mới (HALOVN xanh / Inocare mint).
 *   type='export'   → PHIẾU XUẤT KHO BÁN HÀNG (8 cột, có đơn giá + VAT + QR chuyển khoản)
 *   type='handover' → BIÊN BẢN BÀN GIAO (5 cột, không giá)
 * Header + màu + logo + QR đổi theo pháp nhân đã chọn (xem useCompanies.js).
 * VAT để TRỐNG cho kế toán điền tay (theo yêu cầu).
 * In/PDF: window.print() (@page A4) — nét nhất. "Tải ảnh" dùng html2canvas.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
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

// Mã VietQR động: tự điền số tiền + nội dung CK = số đơn. Ảnh từ img.vietqr.io.
const qrOk = ref(true);
watch([activeKey, activeType], () => { qrOk.value = true; });
const qrUrl = computed(() => {
  const c = co.value;
  if (!c.bankBin || !c.accountNo) return '';
  const p = new URLSearchParams();
  if (total.value > 0) p.set('amount', String(total.value));
  if (docNo.value) p.set('addInfo', String(docNo.value));
  if (c.accountName) p.set('accountName', c.accountName);
  return `https://img.vietqr.io/image/${c.bankBin}-${c.accountNo}-qr_only.png?${p.toString()}`;
});

const fmt = new Intl.NumberFormat('vi-VN');

function todayVN() {
  const d = new Date();
  return { d: d.getDate(), m: d.getMonth() + 1, y: d.getFullYear() };
}
const t = todayVN();

const docNo = computed(() => props.order.order_code || '');
const items = computed(() => props.order.items || []);
const subtotal = computed(() => Number(props.order.subtotal) || 0);
const total = computed(() => Number(props.order.total) || 0);
const amountWords = computed(() => readVND(total.value));

// Số dòng tối thiểu để bảng giống form in sẵn (kẻ ô trống cho đẹp).
// Phiếu xuất kho cao (có QR + tổng tiền + tiền bằng chữ) nên giữ ít dòng
// đệm để phần chữ ký vừa 1 trang A4; biên bản thấp hơn nên để nhiều.
const MIN_ROWS = computed(() => (isExport.value ? 2 : 8));
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
      <div class="co-switch">
        <button @click="activeType = 'export'" :class="['co-btn', { on: isExport }]">Phiếu xuất kho</button>
        <button @click="activeType = 'handover'" :class="['co-btn', { on: !isExport }]">Biên bản bàn giao</button>
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

    <div ref="paper" class="page" :class="co.theme">
      <!-- ===== decorations ===== -->
      <img v-if="co.logo" class="wm" :src="co.logo" alt="" aria-hidden="true" />
      <div class="dots tl"></div>
      <div class="dots br"></div>
      <svg class="wave" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 55 Q250 10 500 45 T1000 40 V90 H0 Z" :fill="'var(--wave1)'" />
        <path d="M0 68 Q250 32 500 60 T1000 55 V90 H0 Z" :fill="'var(--wave2)'" opacity=".9" />
        <path d="M0 80 Q250 55 500 74 T1000 70 V90 H0 Z" :fill="'var(--wave3)'" />
      </svg>

      <div class="content">
        <!-- ===== HEADER ===== -->
        <header class="hd">
          <div class="logo"><img v-if="co.logo" :src="co.logo" :alt="co.name" /></div>

          <div class="company">
            <div class="cname">{{ co.name }}</div>
            <div v-if="co.address" class="crow"><span class="ico"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span>{{ co.address }}</div>
            <div v-if="co.taxCode" class="crow"><span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span>MST: {{ co.taxCode }}</div>
            <div v-if="co.phone" class="crow"><span class="ico"><svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z"/></svg></span>ĐT: {{ co.phone }}</div>
            <div v-if="co.email" class="crow"><span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></span>{{ co.email }}</div>
          </div>

          <!-- Khối thanh toán (chỉ phiếu xuất kho) -->
          <div v-if="isExport && co.accountNo" class="paybox">
            <div class="pt">THANH TOÁN CHUYỂN KHOẢN</div>
            <img v-if="qrUrl" v-show="qrOk" :src="qrUrl" crossorigin="anonymous" class="qr" alt="VietQR" @error="qrOk = false" />
            <div class="bk">{{ co.bankName }}</div>
            <div class="stk">STK: <b>{{ co.accountNo }}</b></div>
            <div class="an">{{ co.accountName }}</div>
          </div>
        </header>

        <div class="rule"></div>

        <!-- ===== TITLE ===== -->
        <div class="titleblock">
          <h1>{{ isExport ? 'PHIẾU XUẤT KHO BÁN HÀNG' : 'BIÊN BẢN BÀN GIAO' }}</h1>
          <div class="dateline"><span class="st">★</span><span>Ngày {{ t.d }} tháng {{ t.m }} năm {{ t.y }}</span><span class="st">★</span></div>
          <div v-if="docNo" class="codepill">Số: <b>{{ docNo }}</b></div>
        </div>

        <!-- =========================================================== -->
        <!-- ===================  PHIẾU XUẤT KHO  ======================= -->
        <!-- =========================================================== -->
        <template v-if="isExport">
          <section class="custcard">
            <div class="crowc">
              <span class="ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span>
              <span class="lbl">Tên khách hàng:</span><span class="val">{{ cust.name }}</span>
              <span class="cur"><span class="lbl">Loại tiền:</span><span class="val">VNĐ</span></span>
            </div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span class="lbl">Địa chỉ:</span><span class="val">{{ cust.address }}</span><span class="fill"></span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z"/></svg></span><span class="lbl">Số điện thoại:</span><span class="val">{{ cust.phone }}</span><span class="fill"></span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span><span class="lbl">Diễn giải:</span><span class="val">{{ cust.note }}</span><span class="fill"></span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span><span class="lbl">Nhân viên bán hàng:</span><span class="val">{{ cust.sale }}</span><span class="fill"></span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span class="lbl">Địa điểm giao hàng:</span><span class="val">{{ cust.deliver }}</span><span class="fill"></span></div>
          </section>

          <table class="items">
            <colgroup>
              <col style="width:7%"/><col style="width:13%"/><col style="width:27%"/><col style="width:9%"/>
              <col style="width:13%"/><col style="width:9%"/><col style="width:10%"/><col style="width:12%"/>
            </colgroup>
            <thead>
              <tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Đơn vị</th><th>Số Lô &amp; Date</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr>
            </thead>
            <tbody>
              <tr v-for="(it, i) in items" :key="i">
                <td class="c">{{ i + 1 }}</td>
                <td class="c">{{ it.sku }}</td>
                <td class="name l">{{ it.name }}</td>
                <td class="c">{{ it.unit }}</td>
                <td></td>
                <td class="c">{{ it.quantity }}</td>
                <td class="r">{{ fmt.format(it.unitPrice) }}</td>
                <td class="r">{{ fmt.format(it.lineTotal) }}</td>
              </tr>
              <tr v-for="n in padRows" :key="'p' + n" class="empty">
                <td class="c">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            </tbody>
          </table>

          <div class="summary">
            <div class="sumrow"><div class="sumlbl">Cộng</div><div class="sumval">{{ fmt.format(subtotal) }}</div></div>
            <div class="sumrow"><div class="sumlbl c">Cộng tiền hàng</div><div class="sumval">{{ fmt.format(subtotal) }}</div></div>
            <div class="sumrow"><div class="split"><span>Thuế suất thuế GTGT: ........ %</span><span class="tax">Tiền thuế GTGT:</span></div><div class="sumval">&nbsp;</div></div>
            <div class="sumrow grand"><div class="sumlbl">Tổng tiền thanh toán</div><div class="sumval">{{ fmt.format(total) }}</div></div>
          </div>

          <div class="words"><span class="ic2">₫</span><span class="lbl">Số tiền bằng chữ:</span> <i>{{ amountWords }}</i></div>

          <div class="signs signs-3">
            <div class="sig"><div class="sico"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></div><div class="role">Người lập phiếu</div><div class="note">(Ký, ghi rõ họ tên)</div><div class="sline"></div></div>
            <div class="sig"><div class="sico"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div><div class="role">Người nhận hàng</div><div class="note">(Ký, ghi rõ họ tên)</div><div class="sline"></div></div>
            <div class="sig"><div class="sico"><svg viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></div><div class="role">Thủ kho</div><div class="note">(Ký, ghi rõ họ tên)</div><div class="sline"></div></div>
          </div>
        </template>

        <!-- =========================================================== -->
        <!-- ===================  BIÊN BẢN BÀN GIAO  ==================== -->
        <!-- =========================================================== -->
        <template v-else>
          <section class="custcard">
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span><span class="lbl">Hôm nay, ngày {{ t.d }} tháng {{ t.m }} năm {{ t.y }} tại:</span><span class="val">{{ cust.deliver }}</span><span class="fill"></span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span><span class="lbl">Đại diện bên nhận (Bên A):</span><span class="val">{{ cust.name }}</span><span class="fill"></span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg></span><span class="lbl">Đại diện bên giao (Bên B):</span><span class="val">{{ co.name }}</span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z"/></svg></span><span class="lbl">Số điện thoại:</span><span class="val">{{ cust.phone }}</span><span class="fill"></span></div>
            <div class="crowc"><span class="ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span><span class="lbl">Nhân viên bán hàng:</span><span class="val">{{ cust.sale }}</span><span class="fill"></span></div>
          </section>

          <div class="handover-lead">Bên B đã bàn giao cho bên A các mặt hàng sau:</div>

          <table class="items">
            <colgroup>
              <col style="width:8%"/><col style="width:44%"/><col style="width:14%"/><col style="width:18%"/><col style="width:16%"/>
            </colgroup>
            <thead>
              <tr><th>STT</th><th>Tên hàng</th><th>ĐVT</th><th>Số Lô &amp; Date</th><th>Số lượng</th></tr>
            </thead>
            <tbody>
              <tr v-for="(it, i) in items" :key="i">
                <td class="c">{{ i + 1 }}</td>
                <td class="name l">{{ it.name }}</td>
                <td class="c">{{ it.unit }}</td>
                <td></td>
                <td class="c">{{ it.quantity }}</td>
              </tr>
              <tr v-for="n in padRows" :key="'p' + n" class="empty">
                <td class="c">&nbsp;</td><td></td><td></td><td></td><td></td>
              </tr>
            </tbody>
          </table>

          <div class="note-line"><i>Xin Quý khách vui lòng ký ghi rõ họ tên trên biên bản sau khi đã nhận đủ hàng.</i></div>

          <div class="signs signs-2">
            <div class="sig"><div class="sico"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div><div class="role">ĐẠI DIỆN BÊN NHẬN</div><div class="note">(Ký, ghi rõ họ tên)</div><div class="sline"></div></div>
            <div class="sig"><div class="sico"><svg viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg></div><div class="role">ĐẠI DIỆN BÊN GIAO</div><div class="note">(Ký, ghi rõ họ tên)</div><div class="sline"></div></div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.doc-overlay{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.6);overflow:auto;
  display:flex;flex-direction:column;align-items:center;padding:72px 16px 40px;}
.doc-actions{position:fixed;top:16px;right:20px;display:flex;align-items:center;gap:8px;z-index:61;flex-wrap:wrap;justify-content:flex-end;}
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

/* ===== A4 sheet ===== */
.page{position:relative;width:210mm;min-height:297mm;flex:none;background:#fff;padding:12mm;overflow:visible;
  box-sizing:border-box;box-shadow:0 16px 50px rgba(0,0,0,.4);
  font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;}

/* ===== themes ===== */
.page{--ink:#111827;--muted:#4B5563;}
.page.halovn{--blue:#1F5FB8;--deep:#0B3F8A;--light:#EAF2FF;--tint:#F8FBFF;--bd:#9EC3F5;
  --wave1:#EAF2FF;--wave2:#1F5FB8;--wave3:#0B3F8A;}
.page.inocare{--blue:#2E8B86;--deep:#1B6360;--light:#E7F5F3;--tint:#F5FBFA;--bd:#B7DEDA;
  --wave1:#E7F5F3;--wave2:#2E8B86;--wave3:#1B6360;}

/* ===== decorations ===== */
.wm{position:absolute;left:50%;top:120mm;transform:translate(-50%,-50%);
  width:130mm;opacity:.05;z-index:0;pointer-events:none;}
.dots{position:absolute;width:34mm;height:34mm;z-index:0;opacity:.5;pointer-events:none;
  background-image:radial-gradient(var(--bd) 1.1px,transparent 1.2px);background-size:5mm 5mm;}
.dots.tl{top:6mm;left:6mm;}
.dots.br{right:6mm;bottom:26mm;}
.wave{position:absolute;left:0;right:0;bottom:0;width:100%;z-index:0;pointer-events:none;}
.content{position:relative;z-index:1;}

/* ===== header ===== */
.hd{display:grid;grid-template-columns:23% 47% 30%;gap:6mm;align-items:center;}
.logo{display:flex;align-items:center;justify-content:center;}
.page.halovn .logo img{height:28mm;width:auto;max-width:100%;display:block;}
.page.inocare .logo img{width:44mm;height:auto;max-width:100%;display:block;}
.company .cname{font-weight:800;font-size:17pt;color:var(--blue);line-height:1.15;
  text-transform:uppercase;margin-bottom:2mm;}
.company .crow{display:flex;align-items:center;gap:2.4mm;font-size:10.2pt;color:var(--ink);
  margin:1.3mm 0;line-height:1.25;}
.ico{flex:0 0 auto;width:5.4mm;height:5.4mm;border-radius:50%;background:var(--blue);
  display:inline-flex;align-items:center;justify-content:center;}
.ico svg{width:3.1mm;height:3.1mm;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}

/* payment box */
.paybox{border:1.2px solid var(--bd);border-radius:4mm;padding:2.6mm 2.6mm 3mm;
  text-align:center;background:linear-gradient(180deg,#fff,var(--tint));}
.paybox .pt{font-size:8.4pt;font-weight:800;color:#fff;background:var(--blue);
  border-radius:20px;padding:1.4mm 3mm;letter-spacing:.3px;display:inline-block;margin-bottom:2mm;}
.paybox .qr{width:26mm;height:26mm;display:block;margin:0 auto 1.4mm;
  border:1px solid var(--bd);border-radius:2mm;padding:1mm;background:#fff;}
.paybox .bk{font-size:9pt;font-weight:700;color:var(--deep);line-height:1.35;}
.paybox .stk{font-size:9.4pt;color:var(--ink);}
.paybox .stk b{color:var(--deep);}
.paybox .an{font-size:8.4pt;color:var(--muted);line-height:1.3;}

.rule{height:2px;background:linear-gradient(90deg,transparent,var(--bd),transparent);margin:4mm 0 0;}

/* ===== title ===== */
.titleblock{text-align:center;margin:4mm 0 3mm;}
.titleblock h1{margin:0;font-size:24pt;font-weight:800;color:var(--deep);
  text-transform:uppercase;letter-spacing:.6px;text-wrap:balance;}
.dateline{display:flex;align-items:center;justify-content:center;gap:3mm;
  color:var(--deep);font-style:italic;font-size:11pt;margin-top:1.5mm;}
.dateline .st{color:var(--blue);font-size:9pt;}
.codepill{display:inline-block;margin-top:2.4mm;background:var(--blue);color:#fff;
  font-weight:700;font-size:11pt;border-radius:20px;padding:1.6mm 6mm;letter-spacing:.3px;}
.codepill b{font-weight:800;}

/* ===== customer card ===== */
.custcard{border:1.2px solid var(--bd);border-radius:4mm;background:var(--tint);padding:3.4mm 4mm;margin-top:1mm;}
.crowc{display:flex;align-items:center;gap:2.4mm;min-height:5.8mm;font-size:10.6pt;}
.lbl{color:var(--muted);flex:0 0 auto;}
.val{font-weight:700;color:var(--ink);}
.fill{flex:1;border-bottom:1.4px dotted var(--bd);align-self:flex-end;margin-bottom:1mm;min-width:8mm;}
.cur{margin-left:auto;display:flex;align-items:center;gap:2mm;flex:0 0 auto;}

/* ===== items table ===== */
table.items{width:100%;border-collapse:collapse;margin-top:4mm;font-size:10.2pt;table-layout:fixed;}
table.items th{background:var(--blue);color:#fff;font-weight:700;font-size:9.6pt;
  padding:2.4mm 2mm;border:1px solid var(--blue);text-align:center;line-height:1.15;}
table.items td{border:1px solid var(--bd);padding:2.3mm 2mm;vertical-align:middle;
  word-wrap:break-word;overflow-wrap:break-word;height:9mm;}
table.items tbody tr:nth-child(even){background:var(--tint);}
.c{text-align:center;} .l{text-align:left;} .r{text-align:right;font-variant-numeric:tabular-nums;}
td.name{font-weight:600;}

/* ===== summary ===== */
.summary{margin-top:0;border:1px solid var(--bd);border-top:none;font-size:10.4pt;}
.sumrow{display:flex;align-items:stretch;}
.sumrow:not(:last-child){border-bottom:1px solid var(--bd);}
.sumlbl{flex:1;padding:1.8mm 3mm;color:var(--ink);}
.sumlbl.c{text-align:center;font-weight:600;}
.sumval{flex:0 0 30mm;padding:1.8mm 3mm;text-align:right;font-weight:700;color:var(--deep);
  border-left:1px solid var(--bd);font-variant-numeric:tabular-nums;}
.split{display:flex;flex:1;padding:0;}
.split>span{flex:1;padding:1.8mm 3mm;color:var(--muted);}
.split .tax{flex:0 0 44%;border-left:1px solid var(--bd);}
.grand{background:linear-gradient(90deg,var(--deep),var(--blue));}
.grand .sumlbl{color:#fff;font-weight:800;font-size:11.5pt;text-align:center;}
.grand .sumval{color:#fff;font-weight:800;font-size:12.5pt;border-left-color:rgba(255,255,255,.4);}

/* ===== words ===== */
.words{display:flex;align-items:center;gap:2.6mm;margin-top:3.4mm;font-size:10.6pt;}
.words .ic2{flex:0 0 auto;width:6mm;height:6mm;border-radius:50%;background:var(--light);
  color:var(--deep);display:inline-flex;align-items:center;justify-content:center;font-weight:800;}
.words .lbl{color:var(--muted);}
.words i{color:var(--ink);font-weight:600;}

.handover-lead{margin-top:4mm;font-weight:700;color:var(--deep);}
.note-line{text-align:center;margin-top:6mm;font-size:10.4pt;color:var(--muted);}

/* ===== signatures ===== */
.signs{display:grid;gap:6mm;margin-top:5mm;text-align:center;}
.signs-3{grid-template-columns:repeat(3,1fr);}
.signs-2{grid-template-columns:repeat(2,1fr);padding:0 8%;}
.sig .sico{width:9mm;height:9mm;border-radius:50%;background:var(--light);margin:0 auto 1.5mm;
  display:flex;align-items:center;justify-content:center;}
.sig .sico svg{width:4.6mm;height:4.6mm;fill:none;stroke:var(--blue);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.sig .role{font-weight:800;color:var(--deep);font-size:11pt;}
.sig .note{font-style:italic;color:var(--muted);font-size:9pt;margin-top:.5mm;}
.sig .sline{border-bottom:1.4px dotted var(--bd);margin:9mm 4mm 0;}
</style>

<!-- In: chỉ tờ chứng từ, khổ A4 dọc -->
<style>
@media print {
  @page { size: A4 portrait; margin: 0; }
  body * { visibility: hidden !important; }
  .doc-overlay, .doc-overlay * { visibility: visible !important; }
  .doc-overlay { position: absolute !important; inset: 0 !important; background: #fff !important; padding: 0 !important; display: block !important; }
  .doc-actions { display: none !important; }
  .doc-overlay .page { width: 210mm !important; min-height: 297mm !important; box-shadow: none !important; margin: 0 !important; }
  html, body { background: #fff !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
</style>
