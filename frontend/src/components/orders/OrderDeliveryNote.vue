<template>
  <!-- Off-screen by default; visible only when print dialog is open. The
       `@media print` rules in <style> hide the rest of the app. -->
  <div class="delivery-note-wrap" :class="{ 'is-print-mode': printMode }">
    <div class="delivery-note">
      <!-- Header -->
      <header class="dn-header">
        <div class="dn-brand">
          <div class="dn-brand-name">HaloVN — Nghề Dược Sĩ</div>
          <div class="dn-brand-tag">Phân phối sỉ TPCN cao cấp</div>
          <div class="dn-brand-meta">
            ngheduocsi.vn · Hotline: 0888 888 888
          </div>
        </div>
        <div class="dn-title">
          <div class="dn-title-main">PHIẾU GIAO HÀNG</div>
          <div class="dn-title-sub">{{ order.orderCode }}</div>
        </div>
      </header>

      <!-- Order meta -->
      <section class="dn-meta">
        <div>
          <span class="dn-label">Ngày đặt:</span>
          <strong>{{ formatDate(order.orderDate ?? order.createdAt) }}</strong>
        </div>
        <div>
          <span class="dn-label">Sale phụ trách:</span>
          <strong>{{ order.assignedSale?.fullName ?? order.createdBy?.fullName ?? '—' }}</strong>
        </div>
        <div>
          <span class="dn-label">Trạng thái:</span>
          <strong>{{ statusLabel(order.statusNormalized) }}</strong>
        </div>
      </section>

      <!-- Customer block -->
      <section class="dn-section">
        <div class="dn-section-title">Khách hàng</div>
        <div class="dn-customer">
          <div><strong>{{ order.contact?.fullName ?? '—' }}</strong></div>
          <div v-if="order.contact?.storeName">{{ order.contact.storeName }}</div>
          <div v-if="order.contact?.phone">SĐT: {{ order.contact.phone }}</div>
          <div v-if="order.deliveryAddress">Địa chỉ: {{ order.deliveryAddress }}</div>
          <div v-else-if="order.contact?.address">Địa chỉ: {{ order.contact.address }}</div>
          <div v-if="order.contact?.policyTier" class="dn-tier">
            Chính sách: {{ tierLabel(order.contact.policyTier) }}
          </div>
        </div>
      </section>

      <!-- Items table -->
      <section class="dn-section">
        <div class="dn-section-title">Danh mục sản phẩm</div>
        <table class="dn-table">
          <thead>
            <tr>
              <th class="dn-th-num">STT</th>
              <th>Tên sản phẩm</th>
              <th>SKU</th>
              <th>Lô</th>
              <th class="dn-th-num">SL</th>
              <th class="dn-th-money">Đơn giá</th>
              <th class="dn-th-money">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in order.items ?? []" :key="item.id">
              <td class="dn-num">{{ idx + 1 }}</td>
              <td>{{ item.productName }}</td>
              <td class="dn-mono">{{ item.sku }}</td>
              <td class="dn-mono">{{ item.batch?.batchCode ?? '—' }}</td>
              <td class="dn-num">{{ item.quantity }} {{ item.unit ?? '' }}</td>
              <td class="dn-money">{{ formatPlain(item.unitPrice) }}</td>
              <td class="dn-money">{{ formatPlain(item.lineTotal) }}</td>
            </tr>
            <tr v-if="(order.items?.length ?? 0) === 0">
              <td colspan="7" style="text-align: center; padding: 12px; color: #777;">
                Chưa có sản phẩm
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Gifts block -->
        <div v-if="(order.gifts?.length ?? 0) > 0" class="dn-gifts">
          <div class="dn-gifts-title">Quà tặng kèm</div>
          <ul class="dn-gifts-list">
            <li v-for="g in order.gifts ?? []" :key="g.id">
              {{ g.giftName }}
              <span class="dn-gift-qty">×{{ g.quantity }}</span>
              <span class="dn-gift-tag">FREE</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Totals -->
      <section class="dn-totals">
        <div class="dn-totals-row">
          <span>Tổng tiền hàng:</span>
          <span class="dn-mono">{{ formatPlain(toNum(order.subtotalAmount)) }} đ</span>
        </div>
        <div v-if="toNum(order.discountAmount) > 0" class="dn-totals-row dn-totals-discount">
          <span>Chiết khấu:</span>
          <span class="dn-mono">- {{ formatPlain(toNum(order.discountAmount)) }} đ</span>
        </div>
        <div v-if="toNum(order.shippingFee) > 0" class="dn-totals-row">
          <span>Phí vận chuyển:</span>
          <span class="dn-mono">{{ formatPlain(toNum(order.shippingFee)) }} đ</span>
        </div>
        <div class="dn-totals-row dn-totals-grand">
          <span>TỔNG PHẢI THU:</span>
          <span class="dn-mono">{{ formatPlain(total) }} đ</span>
        </div>
        <div class="dn-totals-row">
          <span>Đã thanh toán:</span>
          <span class="dn-mono">{{ formatPlain(paid) }} đ</span>
        </div>
        <div v-if="debt > 0" class="dn-totals-row dn-totals-debt">
          <span>Còn nợ:</span>
          <span class="dn-mono">{{ formatPlain(debt) }} đ</span>
        </div>
      </section>

      <!-- Payment + customer note -->
      <section class="dn-section dn-payment-note">
        <div>
          <div class="dn-label">Hình thức TT:</div>
          <strong>{{ paymentMethodLabel(order.paymentMethod) }}</strong>
          <span v-if="order.debtDueDate" class="dn-due">
            (Hạn nợ: {{ formatDate(order.debtDueDate) }})
          </span>
        </div>
        <div v-if="order.customerNote" class="dn-customer-note">
          <div class="dn-label">Ghi chú:</div>
          <div>{{ order.customerNote }}</div>
        </div>
      </section>

      <!-- Signatures -->
      <section class="dn-signatures">
        <div class="dn-sign-block">
          <div class="dn-sign-label">Người giao hàng</div>
          <div class="dn-sign-hint">(Ký, ghi rõ họ tên)</div>
          <div class="dn-sign-space" />
        </div>
        <div class="dn-sign-block">
          <div class="dn-sign-label">Người nhận hàng</div>
          <div class="dn-sign-hint">(Ký, ghi rõ họ tên)</div>
          <div class="dn-sign-space" />
        </div>
      </section>

      <footer class="dn-footer">
        Cảm ơn quý khách đã đồng hành cùng Nghề Dược Sĩ. Mọi thắc mắc vui lòng liên hệ Sale phụ trách.
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { toNum, statusLabel, type Order } from '@/composables/use-orders';

const props = defineProps<{
  order: Order;
  printMode?: boolean;
}>();

const total = computed(() => toNum(props.order.totalAmountValue ?? props.order.totalAmount));
const paid = computed(() => toNum(props.order.paidAmount));
const debt = computed(() => Math.max(0, total.value - paid.value));

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatPlain(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (Number.isNaN(num)) return '0';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(num);
}

const TIER_LABELS: Record<string, string> = {
  ctv: 'CTV',
  dai_ly_cap_1: 'Đại lý cấp 1',
  dai_ly_cap_2: 'Đại lý cấp 2 (VIP)',
};
function tierLabel(t: string) {
  return TIER_LABELS[t] ?? t;
}

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Chuyển khoản',
  cod: 'COD (thu hộ)',
  cash: 'Tiền mặt',
  credit: 'Công nợ',
};
function paymentMethodLabel(m: string | null) {
  if (!m) return '—';
  return PAYMENT_LABELS[m] ?? m;
}
</script>

<style scoped>
/* Default screen presentation (preview) */
.delivery-note-wrap {
  display: flex;
  justify-content: center;
  padding: 24px;
  background: #f4f4f6;
  min-height: 100%;
}

.delivery-note {
  width: 148mm; /* A5 width */
  min-height: 210mm;
  background: white;
  color: #111;
  padding: 12mm 14mm;
  font-family: 'Times New Roman', Times, serif;
  font-size: 11pt;
  line-height: 1.4;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
}

.dn-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #111;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.dn-brand-name {
  font-weight: 700;
  font-size: 13pt;
}
.dn-brand-tag {
  font-style: italic;
  color: #555;
  font-size: 9pt;
}
.dn-brand-meta {
  font-size: 8pt;
  color: #444;
  margin-top: 2px;
}
.dn-title {
  text-align: right;
}
.dn-title-main {
  font-weight: 800;
  font-size: 16pt;
  letter-spacing: 1px;
}
.dn-title-sub {
  font-family: ui-monospace, monospace;
  font-size: 11pt;
  margin-top: 2px;
  color: #c75e14;
}

.dn-meta {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 9pt;
  margin-bottom: 10px;
  padding: 6px 8px;
  background: #f7f7f7;
  border-radius: 4px;
}
.dn-label {
  color: #666;
  margin-right: 4px;
}

.dn-section {
  margin-bottom: 10px;
}
.dn-section-title {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 9pt;
  letter-spacing: 0.5px;
  color: #c75e14;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 2px;
  margin-bottom: 6px;
}
.dn-customer {
  font-size: 10pt;
  line-height: 1.5;
}
.dn-tier {
  font-style: italic;
  color: #555;
}

.dn-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10pt;
}
.dn-table th,
.dn-table td {
  border: 1px solid #999;
  padding: 4px 6px;
  vertical-align: top;
}
.dn-table th {
  background: #efe7d8;
  font-weight: 700;
  text-align: left;
}
.dn-th-num,
.dn-num {
  text-align: center;
}
.dn-th-money,
.dn-money {
  text-align: right;
}
.dn-mono {
  font-family: ui-monospace, monospace;
  font-size: 9pt;
}

.dn-gifts {
  margin-top: 8px;
  padding: 6px 8px;
  background: #fafffa;
  border: 1px dashed #4a8d4a;
  border-radius: 4px;
}
.dn-gifts-title {
  font-weight: 700;
  font-size: 9pt;
  color: #2a6a2a;
  margin-bottom: 2px;
}
.dn-gifts-list {
  margin: 0;
  padding-left: 16px;
  font-size: 10pt;
}
.dn-gift-qty {
  font-family: ui-monospace, monospace;
  margin-left: 6px;
}
.dn-gift-tag {
  display: inline-block;
  margin-left: 6px;
  background: #2a6a2a;
  color: white;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 7pt;
  font-weight: 700;
}

.dn-totals {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #999;
}
.dn-totals-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  font-size: 10pt;
}
.dn-totals-discount {
  color: #c75e14;
}
.dn-totals-grand {
  font-weight: 800;
  font-size: 12pt;
  border-top: 2px solid #111;
  margin-top: 4px;
  padding-top: 4px;
}
.dn-totals-debt {
  color: #c43030;
  font-weight: 700;
}

.dn-payment-note {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 10pt;
  margin-top: 8px;
}
.dn-customer-note {
  flex: 1;
  text-align: right;
}
.dn-due {
  font-style: italic;
  color: #555;
  margin-left: 4px;
}

.dn-signatures {
  display: flex;
  justify-content: space-around;
  margin-top: 18mm;
  font-size: 10pt;
}
.dn-sign-block {
  text-align: center;
  width: 50%;
}
.dn-sign-label {
  font-weight: 700;
}
.dn-sign-hint {
  font-style: italic;
  font-size: 9pt;
  color: #555;
  margin-top: 1px;
}
.dn-sign-space {
  height: 18mm;
  margin-top: 4px;
  border-bottom: 1px dashed #aaa;
}

.dn-footer {
  margin-top: 12px;
  text-align: center;
  font-style: italic;
  font-size: 8pt;
  color: #555;
}

/* Print styles — only this component visible when printing */
@media print {
  /* Hide everything except print container — handled by parent print mode */
  :global(body.printing-delivery-note) :global(.v-application__wrap > *:not(.print-host)) {
    display: none !important;
  }
  :global(body.printing-delivery-note) :global(.v-overlay) {
    display: none !important;
  }
  :global(body.printing-delivery-note) :global(.v-snackbar) {
    display: none !important;
  }
  .delivery-note-wrap {
    padding: 0;
    background: white;
  }
  .delivery-note {
    box-shadow: none;
    margin: 0;
    width: auto;
    max-width: 148mm;
  }
  @page {
    size: A5;
    margin: 8mm;
  }
}
</style>
