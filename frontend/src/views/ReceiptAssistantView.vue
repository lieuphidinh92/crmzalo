<template>
  <div class="assistant-view">
    <div class="d-flex align-center ga-3 mb-3">
      <v-icon icon="mdi-receipt-text-check-outline" color="primary" size="32" />
      <div><h1 class="text-h5">Trợ lý thu tiền</h1><p class="text-body-2 text-medium-emphasis">Đọc bill, đối chiếu khách hàng và kiểm tra công nợ trước khi ghi nhận.</p></div>
    </div>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" role="alert">{{ error }}</v-alert>
    <v-skeleton-loader v-if="restoring" type="article, list-item-three-line" />
    <v-card v-else-if="result" class="pa-5" aria-live="polite">
      <v-icon icon="mdi-check-circle-outline" size="48" color="success" />
      <h2 class="text-h6 mt-2">{{ result.action === 'attach' ? 'Đã bổ sung chứng từ' : 'Đã ghi nhận khoản thu' }}</h2>
      <p class="mt-2">Mã phiếu: {{ result.paymentId }}</p>
      <p>Số tiền phiếu: <strong>{{ money(result.amount) }}</strong></p>
      <p>Còn nợ: <strong>{{ money(result.remainingDebt) }}</strong> · Tiền ứng trước: <strong>{{ money(result.advanceCredit) }}</strong></p>
      <p v-if="result.action === 'attach'" class="mt-2">Số tiền phiếu và công nợ giữ nguyên.</p>
      <div class="d-flex flex-wrap ga-2 my-4"><a v-for="(url, i) in result.proofUrls" :key="url" :href="url" target="_blank" rel="noopener noreferrer">Chứng từ {{ i + 1 }}</a></div>
      <v-btn color="primary" @click="startOver">Xử lý bill tiếp theo</v-btn>
    </v-card>
    <template v-else-if="!restoring">
      <v-card class="pa-4 mb-4">
        <h2 class="text-h6 mb-2">1. Tải bill chuyển khoản</h2>
        <template v-if="!draftId">
          <p class="text-body-2 text-medium-emphasis mb-3">Chọn tối đa 5 ảnh bill. Kiểm tra lại số tiền và ngày chuyển sau khi đọc ảnh.</p>
          <v-file-input v-model="files" label="Ảnh bill chuyển khoản" accept="image/jpeg,image/png,image/webp" multiple show-size :disabled="busy" prepend-icon="mdi-image-plus-outline" />
          <v-btn color="primary" :disabled="!files.length || busy" @click="analyze">{{ busy ? 'Đang đọc bill…' : 'Đọc bill và tìm khách' }}</v-btn>
          <v-skeleton-loader v-if="busy" type="list-item-three-line" class="mt-3" />
        </template>
        <template v-else>
          <div class="d-flex flex-wrap justify-space-between ga-2 mb-3"><p>{{ bills.length }} bill · Chưa ghi nhận vào công nợ</p><v-btn variant="text" :disabled="busy || uncertain" @click="startOver">Chọn bill khác</v-btn></div>
          <v-alert v-for="(warning, i) in uploadWarnings" :key="i" type="warning" variant="tonal" class="mb-2">{{ warning }}</v-alert>
          <div v-for="(bill, index) in bills" :key="bill.id" class="bill-row">
            <a :href="bill.url" target="_blank" rel="noopener noreferrer" :aria-label="`Mở ảnh bill ${index + 1}`"><img :src="bill.url" :alt="`Bill chuyển khoản ${index + 1}`" class="bill-image" /></a>
            <div class="bill-fields">
              <h3 class="text-subtitle-1 mb-2">Bill {{ index + 1 }}</h3>
              <p v-if="bill.fields.senderName || bill.fields.description" class="text-body-2 mb-3">{{ bill.fields.senderName }}<span v-if="bill.fields.description"> · {{ bill.fields.description }}</span></p>
              <p v-if="bill.fields.recipientName || bill.fields.recipientAccount" class="text-body-2 mb-3">Người nhận: {{ bill.fields.recipientName }} · {{ bill.fields.recipientAccount }} {{ bill.fields.bankName }}</p>
              <v-text-field :model-value="moneyInput(bill.fields.amount)" @update:model-value="setAmount(bill, $event)" label="Số tiền trên bill (đ)" inputmode="numeric" :disabled="busy || uncertain" hide-details="auto" />
              <div class="two-columns mt-3">
                <v-text-field v-model="bill.fields.paymentDate" label="Ngày chuyển tiền (giờ Việt Nam)" type="date" :disabled="busy || uncertain" hide-details="auto" />
                <v-text-field v-model="bill.fields.transactionRef" label="Mã giao dịch" :disabled="busy || uncertain" hide-details="auto" />
              </div>
              <p v-for="(warning, i) in bill.warnings" :key="i" class="text-warning text-body-2 mt-2">{{ warning }}</p>
            </div>
          </div>
          <p class="text-right mt-3">Tổng các bill: <strong>{{ money(total) }}</strong></p>
        </template>
      </v-card>
      <template v-if="draftId">
        <v-card class="pa-4 mb-4">
          <h2 class="text-h6 mb-3">2. Chọn khách và cách ghi nhận</h2>
          <div class="d-flex ga-2 align-start"><v-text-field v-model="query" label="Tìm khách theo tên hoặc số điện thoại" :disabled="busy || uncertain" @keyup.enter="searchCustomers" clearable /><v-btn variant="tonal" class="mt-2" :disabled="busy || uncertain || searching" @click="searchCustomers">Tìm</v-btn></div>
          <v-skeleton-loader v-if="searching" type="list-item-two-line" />
          <v-alert v-else-if="searched && !customers.length" type="info" variant="tonal" class="mb-3">Chưa tìm thấy khách phù hợp. Thử tên khác hoặc số điện thoại.</v-alert>
          <v-list v-if="customers.length" class="mb-3" aria-label="Khách hàng gợi ý">
            <v-list-item v-for="customer in customers" :key="customer.id" :active="contactId === customer.id" :disabled="busy || uncertain" @click="selectCustomer(customer.id)" rounded="lg" :title="customer.name" :subtitle="[customer.phone, ...(customer.reasons || [])].filter(Boolean).join(' · ')" :prepend-icon="contactId === customer.id ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank'" />
          </v-list>
          <v-skeleton-loader v-if="loadingCustomer" type="article" />
          <template v-else-if="account">
            <v-alert type="info" variant="tonal" class="mb-3"><strong>{{ account.customer.name }}</strong><br />Còn nợ hiện tại: {{ money(account.debt) }} · Tiền ứng trước: {{ money(account.advanceCredit) }}</v-alert>
            <v-alert v-if="account.suggestionReason" type="info" variant="tonal" class="mb-3">
              <strong>Gợi ý từ ảnh bill{{ account.suggestedAction ? ': ' + actionLabel(account.suggestedAction) : '' }}</strong>
              <p>{{ account.suggestionReason }}</p>
              <p class="text-caption mt-1">Nếu đã sửa số tiền hoặc mã giao dịch, hãy đối chiếu lại. Bản xem trước sẽ dùng thông tin đã sửa.</p>
              <v-btn v-if="account.suggestedAction" variant="tonal" class="mt-2" :disabled="busy || uncertain" @click="useSuggestion">Dùng gợi ý</v-btn>
            </v-alert>
            <v-radio-group v-model="action" :disabled="busy || uncertain" label="Cách ghi nhận">
              <v-radio label="Bổ sung bill vào phiếu thu đã có (không thu thêm tiền)" value="attach" />
              <v-radio label="Thu công nợ — phân bổ cho các đơn còn nợ theo thứ tự cũ nhất" value="collect" />
              <v-radio label="Tiền khách ứng trước — chưa phân bổ vào đơn" value="advance" />
            </v-radio-group>
            <v-select v-if="action === 'attach'" v-model="paymentId" :items="paymentOptions" item-title="label" item-value="id" label="Phiếu thu cần bổ sung bill" :disabled="busy || uncertain" no-data-text="Khách chưa có phiếu thu để đính kèm" />
            <div v-if="action === 'attach' && selectedPayment" class="mb-3">
              <p>Phiếu đã có: {{ money(selectedPayment.amount) }} · {{ dateLabel(selectedPayment.paymentDate) }}. Chỉ bổ sung ảnh, giữ nguyên khoản thu.</p>
              <div class="d-flex flex-wrap ga-3 mt-2"><a v-for="(url, i) in selectedPayment.proofUrls" :key="url" :href="url" target="_blank" rel="noopener noreferrer">Xem chứng từ đã có {{ i + 1 }}</a></div>
            </div>
            <v-alert v-if="action === 'advance'" type="info" variant="tonal" class="mb-3">Tiền này được ghi nhận riêng là ứng trước; công nợ các đơn hiện tại chưa giảm.</v-alert>
            <v-textarea v-model="note" label="Ghi chú đối chiếu" rows="2" :disabled="busy || uncertain" />
            <v-btn color="primary" :disabled="!valid || busy || uncertain" @click="makePreview">{{ busy ? 'Đang đối chiếu…' : 'Xem trước ghi nhận' }}</v-btn>
          </template>
        </v-card>
        <v-card v-if="preview" class="pa-4 mb-4" aria-live="polite">
          <h2 class="text-h6 mb-3">3. Kiểm tra và xác nhận</h2>
          <p><strong>{{ preview.customer.name }}</strong> · Ngày bill: {{ dateLabel(preview.paymentDate) }}</p>
          <p class="text-h6 my-2">{{ preview.action === 'attach' ? 'Tổng bill bổ sung' : 'Số tiền ghi nhận' }}: {{ money(preview.amount) }}</p>
          <div class="two-columns mb-3"><div>Còn nợ trước → sau<br /><strong>{{ money(preview.debtBefore) }} → {{ money(preview.debtAfter) }}</strong></div><div>Ứng trước trước → sau<br /><strong>{{ money(preview.advanceBefore) }} → {{ money(preview.advanceAfter) }}</strong></div></div>
          <v-table v-if="preview.allocations?.length" density="comfortable"><thead><tr><th>Đơn hàng</th><th class="text-right">Phân bổ</th></tr></thead><tbody><tr v-for="allocation in preview.allocations" :key="allocation.orderId"><td>{{ allocation.orderCode }}</td><td class="text-right">{{ money(allocation.applied) }}</td></tr></tbody></v-table>
          <v-alert v-for="(warning, i) in preview.warnings" :key="`w${i}`" type="warning" variant="tonal" class="mt-3">{{ warning }}</v-alert>
          <v-alert v-for="(duplicate, i) in preview.duplicates" :key="`d${i}`" type="warning" variant="tonal" class="mt-3">{{ duplicateLabel(duplicate) }}</v-alert>
          <v-alert v-if="!preview.canConfirm" type="error" variant="tonal" class="mt-3">Chưa thể ghi nhận. Kiểm tra cảnh báo và đối chiếu phiếu thu đã có.</v-alert>
          <v-alert v-if="uncertain" type="warning" variant="tonal" class="mt-3">Chưa nhận được kết quả xác nhận. Bấm kiểm tra lại để lấy kết quả của chính lượt này, tránh tạo phiếu mới.</v-alert>
          <v-checkbox v-if="!uncertain" v-model="reviewed" label="Tôi đã đối chiếu bill, khách hàng, số tiền, ngày và cách ghi nhận" :disabled="busy || !preview.canConfirm" hide-details />
          <v-btn class="mt-3" color="primary" :disabled="busy || !preview.canConfirm || (!reviewed && !uncertain)" @click="confirm">{{ busy ? 'Đang xác nhận…' : uncertain ? 'Kiểm tra lại kết quả' : preview.action === 'attach' ? 'Xác nhận bổ sung chứng từ' : 'Xác nhận ghi nhận khoản thu' }}</v-btn>
        </v-card>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '@/api';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
interface Bill { id: string; url: string; fields: { amount: number | null; paymentDate: string; transactionRef: string; senderName?: string; description?: string; recipientName?: string; recipientAccount?: string; bankName?: string }; warnings?: string[] }
interface Customer { id: string; name: string; phone?: string; reasons?: string[] }
interface Account { suggestedAction?: 'attach' | 'collect' | 'advance' | null; suggestionReason?: string; possiblePaymentIds?: string[]; customer: Customer; debt: number; advanceCredit: number; payments: { id: string; amount: number; paymentDate: string; reference?: string; proofUrls: string[] }[] }
interface Preview { previewToken: string; action: string; amount: number; paymentDate: string; customer: Customer; debtBefore: number; debtAfter: number; advanceBefore: number; advanceAfter: number; allocations: { orderId: string; orderCode: string; applied: number }[]; duplicates: unknown[]; warnings: string[]; canConfirm: boolean }
interface Result { paymentId: string; action: string; amount: number; remainingDebt: number; advanceCredit: number; proofUrls: string[] }
const auth = useAuthStore();
const route = useRoute(), router = useRouter();
const key = computed(() => `receipt-assistant-draft:${auth.user?.id}`);
const files = ref<File[]>([]), bills = ref<Bill[]>([]), draftId = ref(''), query = ref(''), contactId = ref(''), paymentId = ref(''), note = ref('');
const action = ref('attach'), error = ref(''), uploadWarnings = ref<string[]>([]), customers = ref<Customer[]>([]), account = ref<Account | null>(null), preview = ref<Preview | null>(null), result = ref<Result | null>(null);
const busy = ref(false), searching = ref(false), searched = ref(false), loadingCustomer = ref(false), reviewed = ref(false), uncertain = ref(false), restoring = ref(false);
let searchVersion = 0, customerVersion = 0;
const money = (n: number | null | undefined) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;
const moneyInput = (n: number | null) => n == null ? '' : n.toLocaleString('vi-VN');
const dateLabel = (s: string) => s ? s.slice(0, 10).split('-').reverse().join('/') : 'Chưa có ngày';
const total = computed(() => bills.value.reduce((sum, bill) => sum + Number(bill.fields.amount || 0), 0));
const valid = computed(() => contactId.value && account.value && bills.value.length && bills.value.every(b => Number.isSafeInteger(b.fields.amount) && Number(b.fields.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.fields.paymentDate || '')) && (action.value !== 'attach' || paymentId.value));
const selectedPayment = computed(() => account.value?.payments.find(p => p.id === paymentId.value));
const paymentOptions = computed(() => (account.value?.payments || []).map(p => ({ id: p.id, label: `${dateLabel(p.paymentDate)} · ${money(p.amount)} · ${p.reference || p.id.slice(0, 8)}` })));
function actionLabel(value: string) { return ({ attach: 'Bổ sung bill vào phiếu thu đã có', collect: 'Thu công nợ', advance: 'Ghi nhận tiền ứng trước' } as Record<string, string>)[value] || value; }
function useSuggestion() { if (!account.value?.suggestedAction) return; action.value = account.value.suggestedAction; paymentId.value = action.value === 'attach' && account.value.possiblePaymentIds?.length === 1 ? account.value.possiblePaymentIds[0]! : ''; }
function fail(e: any) { error.value = e?.response?.data?.error || 'Không kết nối được hệ thống. Anh/chị vui lòng thử lại.'; }
function setAmount(bill: Bill, value: string) { const digits = String(value ?? '').replace(/\D/g, ''); bill.fields.amount = digits ? Number(digits) : null; }
function duplicateLabel(value: unknown): string { if (typeof value === 'string') return value; const d = value as Record<string, unknown>; return `${String(d.message || d.reason || 'Có phiếu thu cần đối chiếu')}${d.paymentId ? ` · Mã phiếu: ${d.paymentId}` : ''}`; }
function applyDraft(data: any) { draftId.value = data.draftId; bills.value = data.bills.map((b: Bill) => ({ ...b, fields: { ...b.fields, paymentDate: b.fields.paymentDate || '', transactionRef: b.fields.transactionRef || '' } })); uploadWarnings.value = data.warnings || []; sessionStorage.setItem(key.value, draftId.value); void router.replace({ query: { ...route.query, draft: draftId.value } }); if (data.result) { result.value = data.result; sessionStorage.removeItem(key.value); } }
function startOver() { const { draft: _draft, ...queryRest } = route.query; void router.replace({ query: queryRest }); sessionStorage.removeItem(key.value); searchVersion++; customerVersion++; draftId.value = ''; bills.value = []; files.value = []; customers.value = []; account.value = null; contactId.value = ''; paymentId.value = ''; note.value = ''; query.value = ''; preview.value = null; result.value = null; error.value = ''; uncertain.value = false; searched.value = false; }
async function analyze() {
  error.value = ''; if (files.value.length > 5) { error.value = 'Mỗi lượt tối đa 5 ảnh bill.'; return; }
  if (files.value.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 8 * 1024 * 1024)) { error.value = 'Chọn ảnh JPG, PNG hoặc WebP, tối đa 8 MB mỗi ảnh.'; return; }
  busy.value = true;
  try { const form = new FormData(); files.value.forEach(f => form.append('files', f)); applyDraft((await api.post('/receipt-assistant/analyze', form, { timeout: 180000 })).data); await searchCustomers(); } catch (e) { fail(e); } finally { busy.value = false; }
}
async function searchCustomers() { const version = ++searchVersion; searching.value = true; error.value = ''; try { const { data } = await api.get('/receipt-assistant/customers', { params: { q: query.value || undefined, draftId: draftId.value } }); if (version !== searchVersion) return; customers.value = data.customers; searched.value = true; if (!query.value && data.suggestedQuery) query.value = data.suggestedQuery; } catch (e) { if (version === searchVersion) fail(e); } finally { if (version === searchVersion) searching.value = false; } }
async function selectCustomer(id: string) { const version = ++customerVersion; contactId.value = id; account.value = null; paymentId.value = ''; preview.value = null; loadingCustomer.value = true; error.value = ''; try { const { data } = await api.get(`/receipt-assistant/customers/${id}`, { params: { draftId: draftId.value } }); if (version === customerVersion) account.value = data; } catch (e) { if (version === customerVersion) fail(e); } finally { if (version === customerVersion) loadingCustomer.value = false; } }
watch([bills, contactId, action, paymentId, note], () => { if (!uncertain.value) { preview.value = null; reviewed.value = false; } }, { deep: true, flush: 'sync' });
async function makePreview() { busy.value = true; error.value = ''; reviewed.value = false; preview.value = null; try { preview.value = (await api.post('/receipt-assistant/preview', { draftId: draftId.value, contactId: contactId.value, action: action.value, paymentId: paymentId.value || undefined, bills: bills.value.map(b => ({ id: b.id, amount: b.fields.amount, paymentDate: b.fields.paymentDate, transactionRef: b.fields.transactionRef || '' })), note: note.value })).data; } catch (e) { fail(e); } finally { busy.value = false; } }
async function confirm() { if (!preview.value?.canConfirm) return; busy.value = true; error.value = ''; try { result.value = (await api.post('/receipt-assistant/confirm', { draftId: draftId.value, previewToken: preview.value.previewToken })).data; uncertain.value = false; sessionStorage.removeItem(key.value); } catch (e: any) { fail(e); if (e?.response?.data?.code === 'STALE_PREVIEW') { preview.value = null; reviewed.value = false; uncertain.value = false; error.value = 'Công nợ đã thay đổi. Bấm Xem trước ghi nhận để kiểm tra số mới rồi xác nhận lại.'; } else { uncertain.value = !e?.response || e.response.status >= 500; } } finally { busy.value = false; } }
onMounted(async () => { const id = typeof route.query.draft === 'string' ? route.query.draft : sessionStorage.getItem(key.value); if (!id) return; restoring.value = true; try { const { data } = await api.get(`/receipt-assistant/drafts/${id}`); applyDraft(data); if (!result.value) { await searchCustomers(); if (data.contactId) { await selectCustomer(data.contactId); action.value = data.action || 'attach'; paymentId.value = data.paymentId || ''; note.value = data.note || ''; } } } catch (e) { fail(e); sessionStorage.removeItem(key.value); } finally { restoring.value = false; } });
</script>

<style scoped>
.assistant-view { max-width: 1100px; margin: 0 auto; padding-bottom: 32px; }
.bill-row { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 20px; padding: 20px 0; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.bill-image { width: 100%; height: 240px; object-fit: contain; border-radius: 8px; background: rgba(var(--v-theme-on-surface), .04); }
.bill-fields { min-width: 0; }
.two-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 600px) { .bill-row, .two-columns { grid-template-columns: minmax(0, 1fr); } .bill-image { height: 220px; } .assistant-view :deep(.v-btn) { max-width: 100%; height: auto; min-height: 44px; padding-block: 10px; } .assistant-view :deep(.v-btn__content) { white-space: normal; } }
</style>
