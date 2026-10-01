<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';

const route = useRoute();
const router = useRouter();
const prefix = '/receipt-assistant';
const files = ref([]), draftId = ref(''), bills = ref([]), warnings = ref([]);
const search = ref(''), customers = ref([]), selected = ref(null), customerInfo = ref(null);
const action = ref('attach'), paymentId = ref(''), note = ref('');
const busy = ref(''), error = ref(''), searchError = ref(''), infoError = ref('');
const preview = ref(null), result = ref(null), acknowledged = ref(false), searching = ref(false);
let searchTimer, searchSequence = 0, detailSequence = 0;
const readOnly = computed(() => !!busy.value || !!result.value);
const targetPayment = computed(() => customerInfo.value?.payments?.find(p => p.id === paymentId.value));
const amountSum = computed(() => bills.value.reduce((sum, b) => sum + parseAmount(b.amountText), 0));
const actions = [
  { value: 'attach', label: 'Bổ sung bill vào phiếu thu có sẵn', help: 'Giữ nguyên số tiền và công nợ.' },
  { value: 'collect', label: 'Thu tiền các đơn còn nợ', help: 'Phân bổ vào các đơn còn nợ, theo thứ tự cũ đến mới.' },
  { value: 'advance', label: 'Tiền khách ứng trước', help: 'Lưu khoản chưa phân bổ; chưa giảm nợ của đơn hàng.' },
];
function dateLabel(value) { const day = String(value || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : 'Chưa rõ'; }
function parseAmount(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:[., ]\d{3})*$/.test(text)) return NaN;
  const amount = Number(text.replace(/[., ]/g, ''));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : NaN;
}
function message(err) { return err.response?.data?.error || err.message || 'Không thực hiện được. Anh/chị thử lại nhé.'; }
function warningText(w) { return typeof w === 'string' ? w : w.message || w.reason || w.type || 'Cần kiểm tra lại chứng từ.'; }
function invalidate() { preview.value = null; acknowledged.value = false; }
watch([bills, selected, action, paymentId, note], invalidate, { deep: true });
function pickFiles(event) {
  const picked = Array.from(event.target.files || []); event.target.value = ''; error.value = '';
  for (const file of picked) {
    if (files.value.length >= 5) { error.value = 'Mỗi lượt tối đa 5 bill.'; break; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { error.value = 'Chọn ảnh JPG, PNG hoặc WEBP.'; continue; }
    if (file.size > 8 * 1024 * 1024) { error.value = `${file.name}: tối đa 8 MB mỗi bill.`; continue; }
    files.value.push(file);
  }
}
function applyDraft(data) {
  draftId.value = data.draftId;
  warnings.value = data.warnings || [];
  bills.value = (data.bills || []).map(b => ({ ...b, amountText: b.fields?.amount ? Number(b.fields.amount).toLocaleString('vi-VN') : '', paymentDate: b.fields?.paymentDate?.slice(0, 10) || '', transactionRef: b.fields?.transactionRef || '' }));
  if (data.status === 'confirmed' || data.result) result.value = data.result;
}
async function analyze() {
  if (!files.value.length || busy.value) return;
  busy.value = 'Đang đọc bill…'; error.value = '';
  try {
    const fd = new FormData(); files.value.forEach(file => fd.append('files', file));
    const { data } = await api.post(`${prefix}/analyze`, fd, { timeout: 180000 });
    applyDraft(data); files.value = [];
    await router.replace({ query: { draft: data.draftId } });
    await findCustomers();
  } catch (e) { error.value = message(e); }
  finally { busy.value = ''; }
}
async function findCustomers() {
  if (!draftId.value || result.value) return;
  const seq = ++searchSequence; searching.value = true; searchError.value = '';
  try {
    const { data } = await api.get(`${prefix}/customers`, { params: { q: search.value, draftId: draftId.value } });
    if (seq === searchSequence) customers.value = data.customers || [];
  } catch (e) { if (seq === searchSequence) searchError.value = message(e); }
  finally { if (seq === searchSequence) searching.value = false; }
}
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(findCustomers, 350); });
async function chooseCustomer(customer) {
  selected.value = customer; customerInfo.value = null; paymentId.value = ''; infoError.value = '';
  const seq = ++detailSequence;
  try {
    const { data } = await api.get(`${prefix}/customers/${customer.id}`, { params: { draftId: draftId.value } });
    if (seq === detailSequence) customerInfo.value = data;
  } catch (e) { if (seq === detailSequence) infoError.value = message(e); }
}
function useSuggestion() {
  const suggestion = customerInfo.value;
  if (!suggestion?.suggestedAction || !actions.some(item => item.value === suggestion.suggestedAction)) return;
  action.value = suggestion.suggestedAction;
  const matching = suggestion.possiblePaymentIds || [];
  paymentId.value = action.value === 'attach' && matching.length === 1 ? matching[0] : '';
}
async function getPreview() {
  error.value = ''; invalidate();
  if (!selected.value || !customerInfo.value) { error.value = 'Chọn khách và chờ tải công nợ trước.'; return; }
  if (bills.value.some(b => !Number.isSafeInteger(parseAmount(b.amountText)) || !b.paymentDate)) { error.value = 'Kiểm tra số tiền nguyên đồng và ngày chuyển trên từng bill.'; return; }
  if (action.value === 'attach' && !paymentId.value) { error.value = 'Chọn phiếu thu cần bổ sung bill.'; return; }
  if (action.value !== 'attach' && new Set(bills.value.map(b => b.paymentDate)).size > 1) { error.value = 'Các bill khác ngày cần ghi nhận riêng từng lượt; chỉ bổ sung chứng từ được chọn nhiều ngày.'; return; }
  busy.value = 'Đang đối chiếu công nợ…';
  try {
    const { data } = await api.post(`${prefix}/preview`, { draftId: draftId.value, contactId: selected.value.id, action: action.value, ...(action.value === 'attach' ? { paymentId: paymentId.value } : {}), bills: bills.value.map(b => ({ id: b.id, amount: parseAmount(b.amountText), paymentDate: b.paymentDate, transactionRef: b.transactionRef.trim() })), note: note.value.trim() });
    preview.value = data;
  } catch (e) { error.value = message(e); }
  finally { busy.value = ''; }
}
async function confirm() {
  if (!preview.value?.canConfirm || !acknowledged.value || busy.value) return;
  busy.value = 'Đang xác nhận…'; error.value = '';
  try {
    const { data } = await api.post(`${prefix}/confirm`, { draftId: draftId.value, previewToken: preview.value.previewToken });
    result.value = data;
  } catch (e) {
    error.value = message(e);
    if ([409, 410].includes(e.response?.status)) invalidate();
    // Retain the same draft/token after network failure: server confirmation is idempotent.
  } finally { busy.value = ''; }
}
async function newDraft() {
  draftId.value = ''; bills.value = []; warnings.value = []; selected.value = null; customerInfo.value = null; customers.value = []; search.value = ''; action.value = 'attach'; paymentId.value = ''; note.value = ''; result.value = null; error.value = ''; invalidate();
  await router.replace({ query: {} });
}
onMounted(async () => {
  if (!route.query.draft) return;
  busy.value = 'Đang mở bản nháp…';
  try {
    const { data } = await api.get(`${prefix}/drafts/${encodeURIComponent(String(route.query.draft))}`);
    applyDraft(data);
    if (!result.value && data.contactId) {
      const response = await api.get(`${prefix}/customers/${data.contactId}`, { params: { draftId: draftId.value } });
      customerInfo.value = response.data;
      selected.value = response.data.customer;
      action.value = data.action || 'attach'; paymentId.value = data.paymentId || ''; note.value = data.note || '';
    }
    await findCustomers();
  }
  catch (e) { error.value = message(e); }
  finally { busy.value = ''; }
});
onBeforeUnmount(() => { clearTimeout(searchTimer); searchSequence++; detailSequence++; });
</script>

<template>
  <main class="receipt-assistant mx-auto max-w-5xl p-4 lg:p-6 space-y-5 pb-10">
    <header class="flex flex-wrap justify-between items-start gap-3">
      <div><RouterLink to="/debt" class="text-sm text-royal-700 inline-flex min-h-11 items-center">← Công nợ</RouterLink><h1 class="text-2xl font-bold text-ink-primary">Trợ lý thu tiền</h1><p class="mt-2 text-sm text-ink-secondary">Đọc bill, chọn khách, đối chiếu rồi xác nhận.</p></div>
      <button v-if="draftId" :disabled="!!busy" class="secondary" @click="newDraft">Lượt mới</button>
    </header>
    <p v-if="error" role="alert" class="rounded-xl bg-red-50 text-red-800 p-4">{{ error }}</p>
    <p v-if="busy" role="status" class="rounded-xl bg-blue-50 text-blue-900 p-4 animate-pulse">{{ busy }}</p>
    <section v-if="result" class="panel border-emerald-200 bg-emerald-50 space-y-3" aria-live="polite">
      <h2 class="text-xl font-bold text-emerald-900">Đã xác nhận</h2>
      <p>{{ result.action === 'attach' ? 'Đã bổ sung chứng từ. Số tiền phiếu thu và công nợ giữ nguyên.' : 'Đã ghi nhận khoản thu ' + formatVND(result.amount) + '.' }}</p>
      <p v-if="result.remainingDebt != null">Còn nợ: <strong>{{ formatVND(result.remainingDebt) }}</strong></p>
      <p v-if="result.advanceCredit != null">Tiền ứng trước chưa phân bổ: <strong>{{ formatVND(result.advanceCredit) }}</strong></p>
      <RouterLink to="/debt" class="primary inline-flex">Về công nợ</RouterLink>
    </section>
    <section v-else-if="!draftId" class="panel space-y-4">
      <h2 class="text-lg font-bold">1. Tải bill chuyển khoản</h2>
      <p class="text-sm text-ink-secondary">Tối đa 5 bill của cùng một khách. Ảnh JPG, PNG hoặc WEBP, mỗi file tối đa 8 MB.</p>
      <label class="block rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-6 text-center cursor-pointer"><span class="block font-semibold text-royal-700 mb-3">Chọn ảnh hoặc file bill</span><input :disabled="readOnly" aria-label="Chọn bill chuyển khoản" type="file" accept="image/jpeg,image/png,image/webp" multiple class="block w-full text-sm" @change="pickFiles" /></label>
      <ul class="space-y-2"><li v-for="(file,i) in files" :key="i" class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3"><span class="break-all text-sm">{{ file.name }}</span><button :disabled="readOnly" class="secondary shrink-0" :aria-label="'Bỏ ' + file.name" @click="files.splice(i,1)">Bỏ</button></li></ul>
      <button class="primary" :disabled="readOnly || !files.length" @click="analyze">Đọc bill và gợi ý khách</button>
    </section>
    <template v-else-if="!result">
      <section class="panel space-y-4">
        <h2 class="text-lg font-bold">1. Kiểm tra thông tin trên từng bill</h2>
        <p class="text-sm text-ink-secondary">Thông tin đọc từ ảnh là gợi ý. Đối chiếu số tiền chuyển, ngày, người chuyển và tài khoản nhận trước khi lưu.</p>
        <p v-for="(w,i) in warnings" :key="i" class="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm">{{ warningText(w) }}</p>
        <article v-for="(bill,i) in bills" :key="bill.id" class="border rounded-xl p-4 space-y-3 min-w-0">
          <h3 class="font-bold">Bill {{ i+1 }}</h3>
          <a :href="bill.url" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center text-royal-700 underline">Mở chứng từ gốc ↗</a>
          <img v-if="!bill.url?.split('?')[0].toLowerCase().endsWith('.pdf')" :src="bill.url" :alt="'Chứng từ bill ' + (i+1)" class="max-h-72 rounded-lg object-contain w-full bg-slate-50" />
          <p v-for="(w,j) in bill.warnings || []" :key="j" class="text-sm text-amber-900">{{ warningText(w) }}</p>
          <div class="grid sm:grid-cols-2 gap-3">
            <label>Số tiền chuyển (đ)<input v-model="bill.amountText" :disabled="readOnly" inputmode="numeric" placeholder="100.000.000" @blur="Number.isSafeInteger(parseAmount(bill.amountText)) && (bill.amountText = parseAmount(bill.amountText).toLocaleString('vi-VN'))" /></label>
            <label>Ngày chuyển<input v-model="bill.paymentDate" :disabled="readOnly" type="date" /></label>
            <label class="sm:col-span-2">Mã giao dịch<input v-model="bill.transactionRef" :disabled="readOnly" maxlength="100" placeholder="Nhập nếu bill có mã giao dịch" /></label>
          </div>
          <dl class="text-sm space-y-1 break-words"><div><dt class="inline text-ink-secondary">Người chuyển: </dt><dd class="inline">{{ bill.fields?.senderName || 'Chưa đọc được' }}</dd></div><div><dt class="inline text-ink-secondary">Nội dung: </dt><dd class="inline">{{ bill.fields?.description || 'Chưa đọc được' }}</dd></div><div v-if="bill.fields?.recipientName || bill.fields?.recipientAccount"><dt class="inline text-ink-secondary">Người nhận: </dt><dd class="inline">{{ bill.fields.recipientName }} · {{ bill.fields.recipientAccount }}</dd></div></dl>
        </article>
        <p class="font-semibold">Tổng trên bill: {{ Number.isFinite(amountSum) ? formatVND(amountSum) : 'Cần kiểm tra số tiền' }}</p>
      </section>
      <section class="panel space-y-4">
        <h2 class="text-lg font-bold">2. Chọn đúng khách hàng</h2>
        <label>Tìm theo tên hoặc số điện thoại<input v-model="search" :disabled="readOnly" placeholder="Tên khách / số điện thoại" /></label>
        <p v-if="searching" role="status" class="text-sm animate-pulse">Đang tìm khách…</p>
        <p v-if="searchError" role="alert" class="text-red-700">{{ searchError }} <button class="secondary" @click="findCustomers">Thử lại</button></p>
        <p v-if="!searching && !customers.length" class="text-sm text-ink-secondary">Chưa có khách phù hợp. Nhập tên hoặc số điện thoại để tìm.</p>
        <div class="grid sm:grid-cols-2 gap-2"><button v-for="customer in customers" :key="customer.id" :disabled="readOnly" :aria-pressed="selected?.id === customer.id" class="text-left rounded-xl border p-3 min-h-11" :class="selected?.id === customer.id ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200'" @click="chooseCustomer(customer)"><span class="font-semibold block">{{ customer.name }}</span><span class="text-sm text-ink-secondary block">{{ customer.phone }}</span><span v-for="(reason,i) in customer.reasons || []" :key="i" class="block text-xs text-ink-secondary">{{ reason }}</span></button></div>
        <div v-if="selected" class="rounded-xl bg-slate-50 p-4 space-y-2"><p>Đã chọn: <strong>{{ selected.name }}</strong></p><p v-if="infoError" role="alert">{{ infoError }} <button class="secondary" @click="chooseCustomer(selected)">Tải lại công nợ</button></p><template v-if="customerInfo"><p>Còn nợ các đơn: <strong class="text-red-700">{{ formatVND(customerInfo.debt) }}</strong></p><p>Ứng trước chưa phân bổ: <strong>{{ formatVND(customerInfo.advanceCredit) }}</strong></p></template><p v-else-if="!infoError" class="animate-pulse">Đang tải công nợ…</p></div>
      </section>
      <section v-if="customerInfo" class="panel space-y-4">
        <h2 class="text-lg font-bold">3. Gợi ý ghi nhận</h2>
        <div v-if="customerInfo.suggestionReason" class="rounded-xl bg-blue-50 border border-blue-100 p-4 space-y-3">
          <p class="font-semibold text-blue-900">{{ customerInfo.suggestedAction ? actions.find(item => item.value === customerInfo.suggestedAction)?.label : 'Cần đối chiếu thêm' }}</p>
          <p class="text-sm text-blue-900">{{ customerInfo.suggestionReason }}</p>
          <p class="text-xs text-ink-secondary">Gợi ý dựa trên bill đã đọc và dữ liệu hiện tại. Kiểm tra lại nếu anh/chị đã sửa thông tin trên bill.</p>
          <button v-if="customerInfo.suggestedAction" :disabled="readOnly" class="secondary" @click="useSuggestion">Dùng gợi ý</button>
        </div>
        <label v-for="item in actions" :key="item.value" class="flex gap-3 rounded-xl border p-3 items-start"><input v-model="action" :disabled="readOnly" type="radio" :value="item.value" class="!w-5 !min-h-5 mt-1" name="receipt-action" /><span><strong class="block">{{ item.label }}</strong><span class="text-sm text-ink-secondary">{{ item.help }}</span></span></label>
        <label v-if="action === 'attach'">Phiếu thu cần bổ sung<select v-model="paymentId" :disabled="readOnly"><option value="">Chọn phiếu thu</option><option v-for="payment in customerInfo.payments" :key="payment.id" :value="payment.id">{{ dateLabel(payment.paymentDate) }} · {{ formatVND(payment.amount) }} · {{ payment.reference || payment.id.slice(0,8) }}</option></select><span v-if="!customerInfo.payments?.length" class="text-sm text-amber-800">Khách chưa có phiếu thu để bổ sung chứng từ.</span></label>
        <label>Ghi chú đối chiếu<textarea v-model="note" :disabled="readOnly" rows="2" maxlength="2000" placeholder="Ví dụ: bổ sung bill còn thiếu của lần thu trước" /></label>
        <button :disabled="readOnly" class="primary" @click="getPreview">Đối chiếu và xem trước</button>
      </section>
      <section v-if="preview" class="panel space-y-4 border-blue-200" aria-live="polite">
        <h2 class="text-lg font-bold">4. Xem trước khi xác nhận</h2>
        <p class="font-semibold">{{ preview.customer?.name || selected?.name }}</p><p>{{ actions.find(a => a.value === preview.action)?.label }}</p>
        <p>{{ preview.action === 'attach' ? 'Tổng tiền trên bill bổ sung' : 'Số tiền ghi nhận' }}: <strong>{{ formatVND(preview.amount) }}</strong><span v-if="preview.action !== 'attach'"> · {{ dateLabel(preview.paymentDate) }}</span></p>
        <p v-if="preview.action === 'attach' && targetPayment">Phiếu thu được bổ sung: <strong>{{ formatVND(targetPayment.amount) }}</strong> · {{ dateLabel(targetPayment.paymentDate) }} · {{ targetPayment.reference || targetPayment.id.slice(0,8) }}</p>
        <div class="rounded-xl bg-slate-50 p-4 space-y-2"><p>Còn nợ trước: <strong>{{ formatVND(preview.debtBefore) }}</strong></p><p>Còn nợ sau: <strong>{{ formatVND(preview.debtAfter) }}</strong></p><p>Ứng trước chưa phân bổ: {{ formatVND(preview.advanceBefore) }} → <strong>{{ formatVND(preview.advanceAfter) }}</strong></p></div>
        <p v-if="preview.action === 'attach'" class="text-sm text-blue-900">Chỉ bổ sung ảnh vào phiếu đã chọn. Không ghi thêm khoản thu.</p>
        <ul class="space-y-2"><li v-for="allocation in preview.allocations || []" :key="allocation.orderId || allocation.id" class="flex flex-wrap justify-between gap-2 text-sm"><span>{{ allocation.orderCode }}</span><strong>{{ formatVND(allocation.applied) }}</strong></li></ul>
        <p v-for="(w,i) in preview.warnings || []" :key="'warning'+i" class="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm">{{ warningText(w) }}</p>
        <div v-if="preview.duplicates?.length" class="rounded-xl bg-amber-50 p-4 space-y-2"><h3 class="font-bold">Có dấu hiệu trùng chứng từ</h3><p v-for="(dup,i) in preview.duplicates" :key="i" class="text-sm">{{ warningText(dup) }}<span v-if="dup.amount"> · {{ formatVND(dup.amount) }}</span></p></div>
        <p v-if="!preview.canConfirm" role="alert" class="text-red-700">Chưa thể xác nhận. Kiểm tra cảnh báo và chọn lại cách ghi nhận, sau đó xem trước lại.</p>
        <template v-else><label class="flex items-start gap-3"><input v-model="acknowledged" :disabled="readOnly" type="checkbox" class="!w-5 !min-h-5 mt-1" /><span>Tôi đã đối chiếu bill, khách hàng, số tiền, ngày chuyển và cách ghi nhận ở trên.</span></label><button :disabled="readOnly || !acknowledged" class="primary w-full sm:w-auto" @click="confirm">{{ preview.action === 'attach' ? 'Xác nhận bổ sung bill' : 'Xác nhận ghi nhận tiền' }}</button></template>
      </section>
    </template>
  </main>
</template>
<style scoped>
.panel { border: 1px solid #e2e8f0; border-radius: 16px; background: white; padding: 20px; min-width: 0; }
label { display: block; font-size: 14px; font-weight: 500; }
label.flex { display: flex; }
input:not([type=file]), select, textarea { display: block; width: 100%; min-width: 0; min-height: 44px; margin-top: 6px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 12px; background: white; }
input[type=checkbox], input[type=radio] { padding: 0; flex-shrink: 0; }
.primary, .secondary { min-height: 44px; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; align-items: center; justify-content: center; }
.primary { background: #1d4ed8; color: white; }
.secondary { border: 1px solid #cbd5e1; background: white; color: #334155; }
button:disabled, input:disabled, select:disabled, textarea:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid #60a5fa; outline-offset: 2px; }
</style>
