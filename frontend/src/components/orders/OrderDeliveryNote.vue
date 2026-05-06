<template>
  <!-- Off-screen by default; the parent toggles `body.printing-delivery-note`
       on print so only this component is visible. -->
  <div class="dn-host" :class="{ 'is-print-mode': printMode }">
    <article class="dn-page" :class="{ 'dn-page--cancelled': isCancelled }">
      <!-- ── Watermark for cancelled orders ─────────────────────────── -->
      <div v-if="isCancelled" class="dn-watermark">ĐÃ HUỶ</div>

      <!-- ── Section 1: Header (split navy + orange) ────────────────── -->
      <header class="dn-header">
        <div class="dn-header__left">
          <!-- Inline SVG logo nds (navy gradient + amber dots) — keeps
               crisp at any DPI when the browser saves to PDF. -->
          <svg
            class="dn-logo"
            width="64"
            height="64"
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="ngheduocsi.vn logo"
          >
            <defs>
              <linearGradient id="dnNdsBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#1E3458" />
                <stop offset="100%" stop-color="#0A1628" />
              </linearGradient>
              <radialGradient id="dnNdsGlow" cx="75%" cy="20%" r="50%">
                <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.25" />
                <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="200" height="200" rx="44" fill="url(#dnNdsBg)" />
            <rect x="0" y="0" width="200" height="200" rx="44" fill="url(#dnNdsGlow)" />
            <text
              x="100"
              y="138"
              text-anchor="middle"
              font-family="Inter, 'Plus Jakarta Sans', system-ui, sans-serif"
              font-size="92"
              font-weight="800"
              fill="#FFFFFF"
              letter-spacing="-4"
            >nds</text>
            <circle cx="158" cy="62" r="11" fill="none" stroke="#F59E0B" stroke-width="2.5" />
            <circle cx="158" cy="62" r="6" fill="#F59E0B" />
          </svg>

          <div class="dn-header__brand">
            <div class="dn-brand-name">
              <span style="color: #ffffff">ngheduocsi</span><span style="color: #f59e0b">.vn</span>
            </div>
            <div class="dn-brand-slogan">Nơi nghề dược sĩ cất lời.</div>
            <div class="dn-brand-tagline">Phân phối sỉ TPCN cao cấp</div>
          </div>
        </div>

        <!-- Diagonal/curve cut between left navy and right orange -->
        <div class="dn-header__shape" aria-hidden="true">
          <svg viewBox="0 0 60 200" preserveAspectRatio="none">
            <path d="M 0 0 L 50 0 L 10 200 L 0 200 Z" fill="#0A1628" />
            <path d="M 50 0 L 60 0 L 60 200 L 10 200 Z" fill="#F97316" />
          </svg>
        </div>

        <div class="dn-header__right">
          <div class="dn-title">PHIẾU GIAO HÀNG</div>
          <div class="dn-subtitle">
            Số: <span class="dn-mono">{{ order.orderCode }}</span>
          </div>
        </div>
      </header>

      <!-- ── Section 1b: Contact strip ──────────────────────────────── -->
      <div class="dn-strip">
        <span><span class="dn-strip__icon">📍</span> Hà Nội</span>
        <span class="dn-strip__sep">·</span>
        <span><span class="dn-strip__icon">📞</span> 0888 888 888</span>
        <span class="dn-strip__sep">·</span>
        <span><span class="dn-strip__icon">✉</span> contact@ngheduocsi.vn</span>
        <span class="dn-strip__sep">·</span>
        <span><span class="dn-strip__icon">🌐</span> ngheduocsi.vn</span>
      </div>

      <!-- ── Section 2: Order info (2 cols) ─────────────────────────── -->
      <section class="dn-info">
        <div class="dn-info__col">
          <div class="dn-section-label">Gửi đến</div>
          <div class="dn-recipient">
            <div class="dn-recipient__name">{{ order.contact?.fullName ?? '—' }}</div>
            <div v-if="order.contact?.storeName" class="dn-recipient__store">
              {{ order.contact.storeName }}
            </div>
            <div v-if="order.contact?.phone" class="dn-recipient__line">
              <span class="dn-info-label">SĐT:</span> {{ order.contact.phone }}
            </div>
            <div v-if="!isPickup && deliveryAddress" class="dn-recipient__line">
              <span class="dn-info-label">Địa chỉ:</span> {{ deliveryAddress }}
            </div>
            <div v-if="isPickup" class="dn-recipient__pickup">
              <span class="dn-info-label">Hình thức:</span>
              <strong>Khách tự lấy tại kho</strong>
            </div>
          </div>
        </div>

        <div class="dn-info__col dn-info__meta">
          <div class="dn-meta-row">
            <span class="dn-meta-key">Mã đơn</span>
            <span class="dn-meta-sep">:</span>
            <span class="dn-meta-val dn-mono">{{ order.orderCode }}</span>
          </div>
          <div class="dn-meta-row">
            <span class="dn-meta-key">Ngày đặt</span>
            <span class="dn-meta-sep">:</span>
            <span class="dn-meta-val">{{ formatDate(order.orderDate ?? order.createdAt) }}</span>
          </div>
          <div class="dn-meta-row">
            <span class="dn-meta-key">Sale phụ trách</span>
            <span class="dn-meta-sep">:</span>
            <span class="dn-meta-val">{{ saleName }}</span>
          </div>
          <div class="dn-meta-row">
            <span class="dn-meta-key">Trạng thái</span>
            <span class="dn-meta-sep">:</span>
            <span class="dn-meta-val">
              <span
                class="dn-status-dot"
                :style="{ background: statusBadgeColor }"
              />
              {{ statusLabel(order.statusNormalized) }}
            </span>
          </div>
        </div>
      </section>

      <!-- ── Section 3: Items table ─────────────────────────────────── -->
      <section class="dn-items">
        <table class="dn-table">
          <thead>
            <tr>
              <th class="dn-th-num" style="width: 36px">STT</th>
              <th>Tên sản phẩm</th>
              <th style="width: 90px">SKU</th>
              <th style="width: 90px">Lô</th>
              <th class="dn-th-num" style="width: 50px">SL</th>
              <th class="dn-th-money" style="width: 90px">Đơn giá</th>
              <th class="dn-th-money" style="width: 110px">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="(order.items?.length ?? 0) === 0">
              <td colspan="7" class="dn-empty">
                Chưa có sản phẩm
              </td>
            </tr>
            <tr
              v-for="(item, idx) in order.items ?? []"
              :key="item.id"
              :class="idx % 2 === 1 ? 'dn-row--alt' : ''"
            >
              <td class="dn-num">{{ idx + 1 }}</td>
              <td>{{ item.productName }}</td>
              <td class="dn-mono">{{ item.sku }}</td>
              <td class="dn-mono">{{ item.batch?.batchCode ?? '—' }}</td>
              <td class="dn-num">{{ item.quantity }}</td>
              <td class="dn-money">{{ formatPlain(item.unitPrice) }}</td>
              <td class="dn-money">{{ formatPlain(item.lineTotal) }}</td>
            </tr>

            <!-- Gifts as special highlighted rows -->
            <template v-if="hasGifts">
              <tr class="dn-row--gift-header">
                <td colspan="7">
                  <span class="dn-gift-icon">🎁</span>
                  <strong>Quà tặng kèm (FREE)</strong>
                </td>
              </tr>
              <tr
                v-for="(g, gi) in order.gifts ?? []"
                :key="`g-${g.id}`"
                class="dn-row--gift"
              >
                <td class="dn-num">{{ (order.items?.length ?? 0) + gi + 1 }}</td>
                <td>
                  <span class="dn-gift-icon">🎁</span>
                  {{ g.giftName }}
                </td>
                <td class="dn-mono">—</td>
                <td class="dn-mono">{{ g.batch?.batchCode ?? '—' }}</td>
                <td class="dn-num">{{ g.quantity }}</td>
                <td class="dn-money">—</td>
                <td class="dn-money dn-gift-free">Free</td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>

      <!-- ── Section 4: Totals (right-aligned 50%) ──────────────────── -->
      <section class="dn-totals-wrap">
        <div class="dn-totals">
          <div class="dn-tot-row">
            <span>Tổng tiền hàng:</span>
            <span class="dn-mono">{{ formatPlain(subtotal) }} đ</span>
          </div>
          <div v-if="discountAmount > 0" class="dn-tot-row dn-tot-discount">
            <span>{{ discountLabel }}</span>
            <span class="dn-mono">- {{ formatPlain(discountAmount) }} đ</span>
          </div>
          <div v-if="shippingFee > 0" class="dn-tot-row">
            <span>Phí ship:</span>
            <span class="dn-mono">+ {{ formatPlain(shippingFee) }} đ</span>
          </div>
          <div class="dn-tot-divider" />
          <div class="dn-tot-row dn-tot-grand">
            <span>TỔNG PHẢI THU:</span>
            <span class="dn-mono">{{ formatPlain(total) }} đ</span>
          </div>
          <div class="dn-tot-row">
            <span>Đã thanh toán:</span>
            <span class="dn-mono">{{ formatPlain(paid) }} đ</span>
          </div>
          <div class="dn-tot-divider" />
          <div
            class="dn-tot-row dn-tot-debt"
            :class="debt > 0 ? 'dn-tot-debt--owe' : 'dn-tot-debt--paid'"
          >
            <span>{{ debt > 0 ? 'Còn nợ:' : 'Đã thanh toán đủ' }}</span>
            <span class="dn-mono">{{ formatPlain(debt) }} đ</span>
          </div>
          <div v-if="debt > 0 && order.debtDueDate" class="dn-due-warn">
            ⚠ Hạn thanh toán: {{ formatDate(order.debtDueDate) }}
          </div>
        </div>
      </section>

      <!-- ── Section 5: Payment method + customer note ──────────────── -->
      <section class="dn-payment">
        <div class="dn-pay-col">
          <div class="dn-section-label">Hình thức thanh toán</div>
          <div class="dn-pay-value">
            <span class="dn-status-dot" :style="{ background: '#0F172A' }" />
            {{ paymentMethodLabel(order.paymentMethod) }}
          </div>
        </div>
        <div class="dn-pay-col">
          <div class="dn-section-label">Ghi chú</div>
          <div v-if="order.customerNote" class="dn-pay-note">{{ order.customerNote }}</div>
          <div v-else class="dn-pay-note dn-pay-note--empty">—</div>
        </div>
      </section>

      <!-- ── Section 6: Confirmation banner ─────────────────────────── -->
      <div class="dn-confirm">
        Hàng đã giao đầy đủ và đúng số lượng
      </div>

      <!-- ── Section 7: Signatures (2 cols) ─────────────────────────── -->
      <section class="dn-signatures">
        <div class="dn-sign-col">
          <div class="dn-sign-title">Người giao hàng</div>
          <div class="dn-sign-space" />
          <div class="dn-sign-hint">(Ký, ghi rõ họ tên)</div>
        </div>
        <div class="dn-sign-col">
          <div class="dn-sign-title">Người nhận hàng</div>
          <div class="dn-sign-space" />
          <div class="dn-sign-hint">(Ký, ghi rõ họ tên)</div>
        </div>
      </section>

      <!-- ── Section 8: Footer ──────────────────────────────────────── -->
      <footer class="dn-footer">
        Cảm ơn quý khách đã đồng hành cùng Nghề Dược Sĩ. Mọi thắc mắc vui lòng liên hệ Sale phụ trách hoặc Hotline 0888 888 888.
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { toNum, statusLabel, type Order } from '@/composables/use-orders';

const props = defineProps<{
  order: Order;
  printMode?: boolean;
}>();

const subtotal = computed(() => toNum(props.order.subtotalAmount));
const discountAmount = computed(() => toNum(props.order.discountAmount));
const shippingFee = computed(() => toNum(props.order.shippingFee));
const total = computed(() => toNum(props.order.totalAmountValue ?? props.order.totalAmount));
const paid = computed(() => toNum(props.order.paidAmount));
const debt = computed(() => Math.max(0, total.value - paid.value));

const isCancelled = computed(() => props.order.statusNormalized === 'cancelled');
const isPickup = computed(() => props.order.shippingMethod === 'pickup_at_warehouse');
const hasGifts = computed(() => (props.order.gifts?.length ?? 0) > 0);

const deliveryAddress = computed(
  () => props.order.deliveryAddress || props.order.contact?.address || '',
);

const saleName = computed(
  () => props.order.assignedSale?.fullName || props.order.createdBy?.fullName || '—',
);

const discountLabel = computed(() => {
  if (props.order.discountType === 'percent') {
    const pct = toNum(props.order.discountValue);
    return `Chiết khấu (${pct}%):`;
  }
  return 'Chiết khấu:';
});

const STATUS_COLORS: Record<string, string> = {
  draft: '#3B82F6',
  confirmed: '#06B6D4',
  packing: '#A855F7',
  shipping: '#F59E0B',
  completed: '#16A34A',
  cancelled: '#DC2626',
};
const statusBadgeColor = computed(
  () => STATUS_COLORS[props.order.statusNormalized] ?? '#94A3B8',
);

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatPlain(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (Number.isNaN(num)) return '0';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(num);
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
/* ────────────────────────────────────────────────────────────────────
   Screen preview — A4 portrait sheet on a soft grey backdrop.
   Print rules at the bottom; the parent toggles
   `body.printing-delivery-note` to hide everything else.
   ──────────────────────────────────────────────────────────────────── */

.dn-host {
  display: flex;
  justify-content: center;
  padding: 24px;
  background: #f1f3f6;
  min-height: 100%;
}

.dn-page {
  position: relative;
  width: 210mm;
  min-height: 297mm;
  background: #ffffff;
  color: #0f172a;
  font-family: Inter, 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  padding-bottom: 0;
}
.dn-page--cancelled {
  background: #ffffff;
}

/* ── Cancelled watermark — diagonal, semi-transparent, behind content */
.dn-watermark {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Inter, system-ui, sans-serif;
  font-size: 180px;
  font-weight: 900;
  color: rgba(220, 38, 38, 0.14);
  letter-spacing: 12px;
  transform: rotate(-22deg);
  z-index: 50;
  user-select: none;
}

/* ── Section 1: Header ──────────────────────────────────────────── */
.dn-header {
  display: flex;
  align-items: stretch;
  height: 110px;
  position: relative;
}
.dn-header__left {
  flex: 0 0 38%;
  background: #0a1628;
  background: linear-gradient(135deg, #1e3458 0%, #0a1628 100%);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
}
.dn-logo {
  flex: 0 0 64px;
}
.dn-header__brand {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.dn-brand-name {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.4px;
  line-height: 1.1;
}
.dn-brand-slogan {
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 4px;
}
.dn-brand-tagline {
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.dn-header__shape {
  position: absolute;
  left: 36%;
  top: 0;
  width: 4%;
  height: 110px;
  z-index: 1;
}
.dn-header__shape svg {
  width: 100%;
  height: 100%;
  display: block;
}

.dn-header__right {
  flex: 1 1 auto;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  padding: 16px 28px 16px 36px;
  position: relative;
}
.dn-title {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 1.5px;
  line-height: 1;
  text-transform: uppercase;
}
.dn-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

/* ── Section 1b: Strip ──────────────────────────────────────────── */
.dn-strip {
  background: #0a1628;
  color: rgba(255, 255, 255, 0.85);
  font-size: 10px;
  padding: 6px 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  border-bottom: 3px solid #f97316;
}
.dn-strip__icon {
  margin-right: 2px;
}
.dn-strip__sep {
  color: rgba(255, 255, 255, 0.35);
}

/* ── Section 2: Info ────────────────────────────────────────────── */
.dn-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 20px 24px 0;
}
.dn-section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #94a3b8;
  margin-bottom: 6px;
}
.dn-recipient__name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}
.dn-recipient__store {
  font-size: 12px;
  color: #475569;
  margin-top: 2px;
}
.dn-recipient__line {
  font-size: 11.5px;
  color: #334155;
  margin-top: 3px;
}
.dn-recipient__pickup {
  margin-top: 6px;
  padding: 4px 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 4px;
  display: inline-block;
  color: #9a3412;
  font-size: 11px;
}
.dn-info-label {
  color: #64748b;
  margin-right: 4px;
}

.dn-info__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-self: start;
}
.dn-meta-row {
  display: grid;
  grid-template-columns: 110px 12px 1fr;
  gap: 4px;
  font-size: 11.5px;
  align-items: baseline;
}
.dn-meta-key {
  color: #64748b;
  font-weight: 500;
}
.dn-meta-sep {
  color: #cbd5e1;
}
.dn-meta-val {
  color: #0f172a;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dn-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 8px;
}

/* ── Section 3: Items table ─────────────────────────────────────── */
.dn-items {
  margin: 18px 24px 0;
}
.dn-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  border-radius: 6px;
  overflow: hidden;
}
.dn-table thead th {
  background: #f97316;
  color: #ffffff;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 10px 8px;
  text-align: left;
  font-size: 10.5px;
}
.dn-table thead th.dn-th-num,
.dn-table tbody td.dn-num {
  text-align: center;
}
.dn-table thead th.dn-th-money,
.dn-table tbody td.dn-money {
  text-align: right;
}
.dn-table tbody td {
  padding: 9px 8px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
  color: #0f172a;
}
.dn-row--alt td {
  background: #fff7ed;
}
.dn-mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
}
.dn-empty {
  text-align: center;
  padding: 18px !important;
  color: #94a3b8;
  font-style: italic;
}

.dn-row--gift-header td {
  background: #fef3c7;
  border-top: 1px solid #fbbf24;
  border-bottom: 1px solid #fbbf24;
  padding: 8px 12px;
  color: #92400e;
  font-size: 11px;
}
.dn-row--gift td {
  background: #fffbeb;
  color: #78350f;
}
.dn-gift-icon {
  margin-right: 4px;
}
.dn-gift-free {
  font-weight: 700;
  color: #b45309;
}

/* ── Section 4: Totals ──────────────────────────────────────────── */
.dn-totals-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 16px 24px 0;
}
.dn-totals {
  width: 50%;
  min-width: 260px;
}
.dn-tot-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 8px;
  font-size: 11.5px;
}
.dn-tot-discount {
  color: #c2410c;
}
.dn-tot-divider {
  height: 1px;
  background: #cbd5e1;
  margin: 4px 0;
}
.dn-tot-grand {
  background: #ffedd5;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
}
.dn-tot-debt {
  font-weight: 700;
  padding: 8px 10px;
  border-radius: 4px;
}
.dn-tot-debt--owe {
  background: #fee2e2;
  color: #b91c1c;
}
.dn-tot-debt--paid {
  background: #dcfce7;
  color: #166534;
}
.dn-due-warn {
  margin-top: 6px;
  padding: 4px 10px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 4px;
  font-size: 10.5px;
  color: #92400e;
  text-align: right;
}

/* ── Section 5: Payment + note ──────────────────────────────────── */
.dn-payment {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
  padding: 18px 24px 0;
}
.dn-pay-value {
  font-size: 12.5px;
  font-weight: 600;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dn-pay-note {
  font-style: italic;
  font-size: 11.5px;
  color: #475569;
  line-height: 1.4;
}
.dn-pay-note--empty {
  color: #cbd5e1;
}

/* ── Section 6: Confirmation banner ─────────────────────────────── */
.dn-confirm {
  margin: 18px 24px 0;
  padding: 12px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  text-align: center;
  font-style: italic;
  color: #9a3412;
  font-size: 12px;
}

/* ── Section 7: Signatures ──────────────────────────────────────── */
.dn-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  padding: 18px 36px 16px;
}
.dn-sign-col {
  text-align: center;
}
.dn-sign-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #0f172a;
}
.dn-sign-space {
  height: 56px;
  margin-top: 4px;
  border-bottom: 1px solid #94a3b8;
}
.dn-sign-hint {
  font-size: 10px;
  font-style: italic;
  color: #64748b;
  margin-top: 4px;
}

/* ── Section 8: Footer ──────────────────────────────────────────── */
.dn-footer {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  padding: 10px 24px;
  text-align: center;
  font-size: 10px;
  font-style: italic;
  color: #64748b;
}

/* ────────────────────────────────────────────────────────────────────
   Print styles — A4, repeat table headers, hide chrome handled by
   parent's body.printing-delivery-note rules.
   ──────────────────────────────────────────────────────────────────── */
@media print {
  .dn-host {
    padding: 0;
    background: #ffffff;
    min-height: auto;
  }
  .dn-page {
    width: auto;
    min-height: auto;
    box-shadow: none;
    margin: 0;
  }
  /* Repeat table head on each page */
  .dn-table thead {
    display: table-header-group;
  }
  .dn-table tr {
    page-break-inside: avoid;
  }
  /* Keep totals + signatures together when possible */
  .dn-totals-wrap,
  .dn-payment,
  .dn-confirm,
  .dn-signatures {
    page-break-inside: avoid;
  }
  /* Header should not split */
  .dn-header,
  .dn-strip,
  .dn-info {
    page-break-inside: avoid;
  }
  /* Force colors to print (Chrome) — orange + navy */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  @page {
    size: A4 portrait;
    margin: 15mm;
  }
}
</style>
