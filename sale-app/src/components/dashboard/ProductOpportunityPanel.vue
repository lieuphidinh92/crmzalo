<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatVND } from '../../composables/useFormat';

defineProps({ rows: { type: Array, default: () => [] } });
const router = useRouter();
const selected = ref(null);
const failedImages = ref({});

function failImage(url) {
  if (url) failedImages.value[url] = true;
}

function call(customer) {
  if (customer.phone) window.location.href = `tel:${customer.phone}`;
}

function createOrder() {
  selected.value = null;
  router.push('/pos');
}
</script>

<template>
  <section class="h-full overflow-hidden rounded-card border border-line-200 bg-white shadow-card">
    <header class="flex h-[52px] items-center justify-between gap-2 border-b border-line-200 px-4">
      <div>
        <h2 class="text-[14px] font-bold tracking-[-0.01em] text-ink-primary">SẢN PHẨM NÊN BÁN HÔM NAY</h2>
        <p class="mt-0.5 text-[9px] text-ink-secondary">Gợi ý từ hành vi mua 12 tháng</p>
      </div>
      <button class="text-[10px] font-semibold text-royal-700" @click="router.push('/products')">Xem tất cả</button>
    </header>
    <div v-if="!rows.length" class="p-8 text-center text-xs text-ink-secondary">Chưa có cặp sản phẩm đủ độ tin cậy để gợi ý.</div>
    <div v-else class="divide-y divide-line-200">
      <article v-for="row in rows" :key="row.productId" class="flex min-h-[104px] gap-3 px-3 py-3">
        <div class="flex h-[66px] w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-200 bg-white">
          <img v-if="row.imageUrl && !failedImages[row.imageUrl]" :src="row.imageUrl" :alt="row.name" class="h-full w-full object-contain p-0.5" loading="lazy" @error="failImage(row.imageUrl)" />
          <span v-else class="px-1 text-center text-[8px] font-medium leading-3 text-ink-disabled">{{ row.sku }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="line-clamp-2 text-[11px] font-bold leading-4 text-ink-primary" :title="row.name">{{ row.name }}</div>
          <p class="mt-1 line-clamp-2 text-[9px] leading-4 text-ink-secondary">{{ row.reason }}</p>
        </div>
        <div class="flex w-[92px] shrink-0 flex-col items-end text-right">
          <div class="flex items-center gap-1 text-[11px] font-bold text-ink-primary"><span>{{ row.customerCount }} khách</span><svg class="h-3.5 w-3.5 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1a5.5 5.5 0 0 1 11 0v1M16 5.5a3 3 0 0 1 0 5.8M16.5 14a4.5 4.5 0 0 1 4 4.5V19" /></svg></div>
          <div class="mt-0.5 text-[8px] text-ink-secondary">{{ formatVND(row.potentialRevenue) }}</div>
          <button class="mt-auto h-7 rounded-lg border border-royal-100 px-2 text-[9px] font-semibold text-royal-700 hover:bg-royal-50" @click="selected = row">Xem danh sách</button>
        </div>
      </article>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="selected" class="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-5" @click.self="selected = null" @keydown.esc.window="selected = null">
      <section class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Khách hàng nên chào bán sản phẩm">
        <header class="flex items-start justify-between gap-4 border-b border-line-200 px-4 py-4 sm:px-5">
          <div>
            <h3 class="text-base font-bold text-ink-primary">Khách nên chào {{ selected.name }}</h3>
            <p class="mt-1 text-xs text-ink-secondary">{{ selected.customerCount }} khách active · Tiềm năng {{ formatVND(selected.potentialRevenue) }}</p>
          </div>
          <button class="flex h-8 w-8 items-center justify-center rounded-lg border border-line-200 text-ink-secondary" aria-label="Đóng" @click="selected = null">×</button>
        </header>
        <div class="overflow-auto divide-y divide-line-200">
          <article v-for="customer in selected.customers" :key="customer.contactId" class="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1.2fr_1.2fr_100px_auto] sm:items-center sm:px-5">
            <div class="min-w-0">
              <div class="truncate text-xs font-semibold text-ink-primary">{{ customer.name }}</div>
              <div class="mt-1 text-[10px] text-ink-secondary">{{ customer.phone || 'Chưa có số điện thoại' }}</div>
            </div>
            <div class="min-w-0 text-[10px] text-ink-secondary">
              Đã mua <strong class="text-ink-primary">{{ customer.sourceProduct }}</strong>
              <div class="mt-1 text-emerald-700">Độ tin cậy {{ customer.confidencePercent }}%</div>
            </div>
            <div class="text-xs font-bold tabular-nums text-ink-primary sm:text-right">{{ formatVND(customer.potentialRevenue) }}</div>
            <div class="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button :disabled="!customer.phone" class="h-9 rounded-lg border border-line-200 px-2.5 text-[10px] font-semibold disabled:opacity-40" @click="call(customer)">Gọi</button>
              <button class="h-9 rounded-lg bg-royal-700 px-2.5 text-[10px] font-semibold text-white" @click="createOrder">Tạo đơn</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>
