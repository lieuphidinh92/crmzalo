<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { usePOSStore } from '../stores/pos';
import { api } from '../api/client';
import GlobalSearchPanel from './GlobalSearchPanel.vue';
import NotificationDrawer from './NotificationDrawer.vue';
import BrandLogo from './BrandLogo.vue';

const auth = useAuthStore();
const pos = usePOSStore();
const router = useRouter();

const searchQuery = ref('');
const showSearchPanel = ref(false);
const showNotifDrawer = ref(false);
const notifCount = ref(0);
const searchInputRef = ref(null);
const searchWrapperRef = ref(null);
const panelRef = ref(null);

const userName = computed(() => auth.user?.fullName || auth.user?.email || 'Sale');
const cartCount = computed(() => pos.itemCount);

function handleLogout() {
  if (confirm('Đăng xuất?')) auth.logout();
}

function openCart() {
  router.push('/pos');
}

function onSearchInput() {
  showSearchPanel.value = (searchQuery.value || '').trim().length >= 2;
}

function onSearchFocus() {
  if ((searchQuery.value || '').trim().length >= 2) showSearchPanel.value = true;
}

function clearSearch() {
  searchQuery.value = '';
  showSearchPanel.value = false;
}

// Arrow ↑/↓ walk the suggestion list; open the panel first if it's closed.
function onArrowNav(delta) {
  if (!showSearchPanel.value) {
    if ((searchQuery.value || '').trim().length >= 2) showSearchPanel.value = true;
    return;
  }
  panelRef.value?.move(delta);
}

// Enter commits the highlighted suggestion (or the top hit if none highlighted).
function onEnterSelect() {
  if (showSearchPanel.value) panelRef.value?.selectActive();
}

function handleSelect() {
  clearSearch();
  searchInputRef.value?.blur();
}

function handleClickOutside(e) {
  if (!searchWrapperRef.value) return;
  if (!searchWrapperRef.value.contains(e.target)) {
    showSearchPanel.value = false;
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    if (showSearchPanel.value || searchQuery.value) {
      clearSearch();
      searchInputRef.value?.blur();
    }
    return;
  }
  if (e.key === '/') {
    const tag = e.target?.tagName;
    const isEditable =
      tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;
    if (!isEditable) {
      e.preventDefault();
      searchInputRef.value?.focus();
    }
  }
}

async function fetchNotifCount() {
  try {
    const { data } = await api.get('/notifications');
    const list = Array.isArray(data) ? data : data?.notifications || [];
    notifCount.value = list.length;
  } catch {
    notifCount.value = 0;
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
  fetchNotifCount();
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <header
    class="sticky top-0 z-30 bg-white border-b border-line-200"
    style="padding-top: env(safe-area-inset-top)"
  >
    <!-- Mobile header -->
    <div class="lg:hidden h-14 px-4 flex items-center justify-between">
      <BrandLogo size="sm" theme="light" :show-tagline="true" />
      <div class="flex items-center gap-1">
        <a
          href="/huong-dan-su-dung.pdf"
          target="_blank"
          rel="noopener"
          class="w-10 h-10 flex items-center justify-center text-base"
          aria-label="Sách hướng dẫn sử dụng"
          title="Sách HDSD"
        >📖</a>
        <button
          @click="openCart"
          class="relative w-10 h-10 flex items-center justify-center text-ink-secondary hover:text-ink-primary"
          aria-label="Giỏ hàng"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.4 6M7 13l2.4 6M9 21a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z"/>
          </svg>
          <span v-if="cartCount > 0" class="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ cartCount }}
          </span>
        </button>
        <button
          @click="showNotifDrawer = true"
          class="relative w-10 h-10 flex items-center justify-center text-ink-secondary hover:text-ink-primary"
          aria-label="Thông báo"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
          </svg>
          <span v-if="notifCount > 0" class="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ notifCount }}
          </span>
        </button>
      </div>
    </div>

    <!-- Desktop header (72px per spec) -->
    <div class="hidden lg:flex h-[72px] px-6 items-center gap-4">
      <div ref="searchWrapperRef" class="relative flex-1 max-w-[520px]">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          @input="onSearchInput"
          @focus="onSearchFocus"
          @keydown.down.prevent="onArrowNav(1)"
          @keydown.up.prevent="onArrowNav(-1)"
          @keydown.enter.prevent="onEnterSelect"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="showSearchPanel"
          placeholder="Tìm sản phẩm, khách hàng... (gõ / để focus)"
          class="w-full h-11 pl-11 pr-9 rounded-input bg-surface-soft border border-transparent focus:bg-white focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
        />
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <button
          v-if="searchQuery"
          @click="clearSearch"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-line-200 flex items-center justify-center text-ink-secondary"
          aria-label="Xoá"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <GlobalSearchPanel
          v-if="showSearchPanel"
          ref="panelRef"
          :query="searchQuery"
          @select="handleSelect"
          @close="showSearchPanel = false"
        />
      </div>

      <div class="ml-auto flex items-center gap-2">
        <a
          href="/huong-dan-su-dung.pdf"
          target="_blank"
          rel="noopener"
          class="h-11 px-3.5 rounded-btn bg-amber-50 hover:bg-amber-100 text-amber-700 flex items-center gap-2 text-sm font-semibold transition"
          title="Sách hướng dẫn sử dụng"
        >
          <span class="text-base leading-none">📖</span>
          <span>Sách HDSD</span>
        </a>
        <button
          @click="openCart"
          class="relative h-11 px-3 rounded-btn hover:bg-surface-soft flex items-center gap-2 text-sm text-ink-primary transition"
        >
          <svg class="w-5 h-5 text-royal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
          </svg>
          <span class="font-medium">Giỏ</span>
          <span v-if="cartCount > 0" class="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ cartCount }}
          </span>
        </button>
        <button
          @click="showNotifDrawer = true"
          class="relative h-11 px-3 rounded-btn hover:bg-surface-soft flex items-center gap-2 text-sm text-ink-primary transition"
        >
          <svg class="w-5 h-5 text-royal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span class="font-medium">Thông báo</span>
          <span v-if="notifCount > 0" class="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {{ notifCount }}
          </span>
        </button>
        <div class="w-px h-6 bg-line-200 mx-1"></div>
        <button
          @click="handleLogout"
          class="text-sm text-ink-secondary hover:text-red-600 px-3 transition"
        >
          {{ userName }} · Đăng xuất
        </button>
      </div>
    </div>

    <!-- Notification drawer (shared mobile + desktop) -->
    <NotificationDrawer :open="showNotifDrawer" @close="showNotifDrawer = false" />
  </header>
</template>
