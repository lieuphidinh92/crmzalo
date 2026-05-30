<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

const MOCK_PROMOTIONS = [
  {
    id: 'p1',
    title: 'Mua 5 Manhae tặng 1',
    subtitle: 'Áp dụng cho đơn ≥ 5 hộp Manhae bất kỳ',
    code: 'MH5T1',
    status: 'running',
    startsAt: '2026-05-15',
    endsAt: '2026-06-30',
    emoji: '🎁',
  },
  {
    id: 'p2',
    title: 'Freeship đơn từ 2 triệu',
    subtitle: 'Áp dụng toàn quốc',
    code: 'FREESHIP2M',
    status: 'running',
    endsAt: '2026-07-15',
    emoji: '🚚',
  },
  {
    id: 'p3',
    title: 'Tích điểm Đại lý cấp 1',
    subtitle: 'Nhân đôi điểm thưởng từ 01/06',
    code: 'X2POINT',
    status: 'upcoming',
    startsAt: '2026-06-01',
    endsAt: '2026-06-30',
    emoji: '⭐',
  },
  {
    id: 'p4',
    title: 'Sale 20% Bioisland',
    subtitle: 'Toàn bộ sản phẩm sữa rửa mặt Bioisland',
    code: 'BIO20',
    status: 'ended',
    startsAt: '2026-04-01',
    endsAt: '2026-04-30',
    emoji: '💎',
  },
];

const HERO_BANNERS = [
  {
    id: 'h1',
    title: 'MUA 5 TẶNG 1 — MANHAE',
    subtitle: 'Tặng POSM + Freeship toàn quốc cho đơn ≥ 5 hộp',
    ctaLabel: 'Xem chi tiết',
    endsAt: '2026-06-30T23:59:59',
    emoji: '🎁',
  },
  {
    id: 'h2',
    title: 'FREESHIP TOÀN QUỐC',
    subtitle: 'Đơn từ 2 triệu — áp dụng tất cả tỉnh thành',
    ctaLabel: 'Áp dụng ngay',
    endsAt: '2026-07-15T23:59:59',
    emoji: '🚚',
  },
  {
    id: 'h3',
    title: 'X2 ĐIỂM ĐẠI LÝ CẤP 1',
    subtitle: 'Tích điểm gấp đôi tháng 06/2026',
    ctaLabel: 'Tìm hiểu',
    endsAt: '2026-06-30T23:59:59',
    emoji: '⭐',
  },
];

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'running', label: 'Đang chạy' },
  { key: 'upcoming', label: 'Sắp diễn ra' },
  { key: 'ended', label: 'Đã kết thúc' },
];

const activeFilter = ref('all');
const heroIndex = ref(0);
const isHover = ref(false);
const now = ref(new Date());
const toastMsg = ref('');
const detailPromo = ref(null);

let rotateTimer = null;
let clockTimer = null;

onMounted(() => {
  rotateTimer = setInterval(() => {
    if (!isHover.value) {
      heroIndex.value = (heroIndex.value + 1) % HERO_BANNERS.length;
    }
  }, 5000);
  clockTimer = setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onUnmounted(() => {
  clearInterval(rotateTimer);
  clearInterval(clockTimer);
});

const currentBanner = computed(() => HERO_BANNERS[heroIndex.value]);

const countdown = computed(() => {
  const target = currentBanner.value?.endsAt;
  if (!target) return null;
  const ms = Math.max(0, new Date(target).getTime() - now.value.getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    mins: String(mins).padStart(2, '0'),
    secs: String(secs).padStart(2, '0'),
  };
});

const filteredPromos = computed(() => {
  if (activeFilter.value === 'all') return MOCK_PROMOTIONS;
  return MOCK_PROMOTIONS.filter((p) => p.status === activeFilter.value);
});

const statusMeta = {
  running: { label: 'Đang chạy', cls: 'bg-green-50 text-green-700 border-green-200' },
  upcoming: { label: 'Sắp diễn ra', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ended: { label: 'Đã kết thúc', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function formatRange(p) {
  const fmt = (s) => {
    if (!s) return '';
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  if (p.startsAt && p.endsAt) return `${fmt(p.startsAt)} - ${fmt(p.endsAt)}`;
  if (p.endsAt) return `Đến ${fmt(p.endsAt)}`;
  return '';
}

function showToast(msg) {
  toastMsg.value = msg;
  setTimeout(() => {
    toastMsg.value = '';
  }, 2000);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    showToast(`Đã copy mã: ${code}`);
  } catch {
    showToast('Không copy được — vui lòng chọn thủ công');
  }
}

function applyPromo() {
  showToast('Sắp ra mắt — sẽ áp dụng vào đơn hàng');
}

function openDetail(banner) {
  detailPromo.value = banner;
}

function closeDetail() {
  detailPromo.value = null;
}

watch(activeFilter, () => {
  /* triggers recompute */
});
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="mb-4">
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Khuyến mãi</h1>
      <p class="text-xs text-ink-secondary mt-0.5">Chương trình đang chạy + sắp diễn ra</p>
    </div>

    <!-- Hero carousel -->
    <div
      class="relative overflow-hidden rounded-card text-white p-5 lg:p-8 shadow-card cursor-pointer"
      style="background: linear-gradient(135deg, #0A2540 0%, #1E40AF 100%)"
      @mouseenter="isHover = true"
      @mouseleave="isHover = false"
      @click="openDetail(currentBanner)"
    >
      <div class="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-amber-500/15 blur-3xl"></div>

      <div class="relative flex items-center gap-6">
        <div class="flex-1 min-w-0">
          <div class="text-[11px] uppercase tracking-[0.15em] text-amber-500 font-bold mb-2">
            Chương trình nổi bật
          </div>
          <div class="text-2xl lg:text-4xl font-bold text-amber-500 leading-tight mb-2 tracking-tight">
            {{ currentBanner.title }}
          </div>
          <div class="text-sm lg:text-base font-medium text-white/90 mb-4">
            {{ currentBanner.subtitle }}
          </div>

          <div v-if="countdown" class="mb-4">
            <div class="text-[11px] text-slate-300 mb-1.5 uppercase tracking-wide">Kết thúc sau</div>
            <div class="flex gap-2">
              <div class="bg-white/10 backdrop-blur rounded-input w-[52px] h-[52px] flex flex-col items-center justify-center">
                <div class="text-lg font-bold leading-none tabular-nums">{{ countdown.days }}</div>
                <div class="text-[9px] text-slate-300 mt-0.5">Ngày</div>
              </div>
              <div class="bg-white/10 backdrop-blur rounded-input w-[52px] h-[52px] flex flex-col items-center justify-center">
                <div class="text-lg font-bold leading-none tabular-nums">{{ countdown.hours }}</div>
                <div class="text-[9px] text-slate-300 mt-0.5">Giờ</div>
              </div>
              <div class="bg-white/10 backdrop-blur rounded-input w-[52px] h-[52px] flex flex-col items-center justify-center">
                <div class="text-lg font-bold leading-none tabular-nums">{{ countdown.mins }}</div>
                <div class="text-[9px] text-slate-300 mt-0.5">Phút</div>
              </div>
              <div class="bg-white/10 backdrop-blur rounded-input w-[52px] h-[52px] flex flex-col items-center justify-center">
                <div class="text-lg font-bold leading-none tabular-nums">{{ countdown.secs }}</div>
                <div class="text-[9px] text-slate-300 mt-0.5">Giây</div>
              </div>
            </div>
          </div>

          <button
            @click.stop="openDetail(currentBanner)"
            class="h-10 px-5 rounded-btn bg-amber-500 text-navy-900 font-bold text-sm hover:bg-amber-600 transition"
          >
            {{ currentBanner.ctaLabel }}
          </button>
        </div>

        <div class="hidden md:flex items-center justify-center text-7xl lg:text-8xl">
          {{ currentBanner.emoji }}
        </div>
      </div>

      <!-- Pagination dots -->
      <div class="relative flex justify-center gap-2 mt-5">
        <button
          v-for="(b, i) in HERO_BANNERS"
          :key="b.id"
          @click.stop="heroIndex = i"
          class="w-2 h-2 rounded-full transition"
          :class="i === heroIndex ? 'bg-amber-500 w-6' : 'bg-white/40 hover:bg-white/70'"
          :aria-label="`Banner ${i + 1}`"
        />
      </div>
    </div>

    <!-- Filter chips -->
    <div class="flex gap-2 mt-6 mb-4 flex-wrap">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        @click="activeFilter = f.key"
        class="h-9 px-4 rounded-full text-sm font-semibold border transition"
        :class="activeFilter === f.key ? 'bg-royal-700 text-white border-royal-700' : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Promotion list -->
    <div v-if="filteredPromos.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="text-5xl mb-3">🎁</div>
      <div class="font-semibold text-ink-primary">Chưa có khuyến mãi đang chạy</div>
      <p class="text-xs text-ink-secondary mt-1">Quay lại sau để xem chương trình mới.</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div
        v-for="p in filteredPromos"
        :key="p.id"
        class="bg-white border border-line-200 rounded-card p-4 shadow-card hover:shadow-pop transition"
      >
        <div class="flex items-start gap-3">
          <div class="w-12 h-12 rounded-card bg-surface-soft flex items-center justify-center text-2xl shrink-0">
            {{ p.emoji }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide"
                :class="statusMeta[p.status].cls"
              >
                {{ statusMeta[p.status].label }}
              </span>
            </div>
            <h3 class="text-base font-bold text-ink-primary leading-snug">{{ p.title }}</h3>
            <p class="text-sm text-ink-secondary mt-1">{{ p.subtitle }}</p>

            <div class="mt-3 flex items-center gap-2">
              <div class="font-mono text-xs bg-surface-soft border border-line-300 rounded-input px-2.5 py-1 text-ink-primary tracking-wider">
                {{ p.code }}
              </div>
              <button
                @click="copyCode(p.code)"
                class="text-xs text-royal-700 hover:text-royal-800 font-semibold flex items-center gap-1"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy
              </button>
            </div>

            <div class="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <div class="text-xs text-ink-secondary flex items-center gap-1">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {{ formatRange(p) }}
              </div>
              <button
                @click="applyPromo"
                :disabled="p.status === 'ended'"
                class="h-8 px-3 rounded-btn text-xs font-semibold transition"
                :class="p.status === 'ended' ? 'bg-gray-100 text-ink-disabled cursor-not-allowed' : 'bg-royal-700 hover:bg-royal-800 text-white'"
              >
                Áp dụng vào đơn
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail dialog stub -->
    <div
      v-if="detailPromo"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      @click.self="closeDetail"
    >
      <div class="bg-white rounded-modal shadow-pop w-full max-w-md p-6">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div>
            <div class="text-3xl mb-2">{{ detailPromo.emoji }}</div>
            <h3 class="text-lg font-bold text-ink-primary">{{ detailPromo.title }}</h3>
          </div>
          <button @click="closeDetail" class="text-ink-secondary hover:text-ink-primary w-8 h-8 flex items-center justify-center" aria-label="Đóng">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p class="text-sm text-ink-secondary mb-4">{{ detailPromo.subtitle }}</p>
        <div class="bg-surface-soft rounded-input p-3 text-xs text-ink-secondary">
          Chi tiết điều khoản + công cụ áp dụng sẽ có trong Phase 2 (sau khi backend Promotion Engine sẵn sàng).
        </div>
        <button
          @click="closeDetail"
          class="mt-4 w-full h-10 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-semibold text-sm"
        >
          Đã hiểu
        </button>
      </div>
    </div>

    <!-- Toast -->
    <div
      v-if="toastMsg"
      class="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-navy-900 text-white text-sm font-medium px-4 py-2.5 rounded-btn shadow-pop"
    >
      {{ toastMsg }}
    </div>
  </div>
</template>
