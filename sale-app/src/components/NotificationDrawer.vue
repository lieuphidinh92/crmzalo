<script setup>
import { ref, computed, watch } from 'vue';
import { api } from '../api/client';

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const notifications = ref([]);
const loading = ref(false);
const errMsg = ref('');
const filter = ref('all'); // all | unread
const readIds = ref(loadReadIds());

function loadReadIds() {
  try {
    const raw = localStorage.getItem('saleapp:notif:read');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistReadIds() {
  try {
    localStorage.setItem('saleapp:notif:read', JSON.stringify(readIds.value));
  } catch {
    /* ignore */
  }
}

async function fetchNotifs() {
  loading.value = true;
  errMsg.value = '';
  try {
    const { data } = await api.get('/notifications');
    const list = Array.isArray(data) ? data : data?.notifications || [];
    notifications.value = list;
  } catch (err) {
    errMsg.value = err.response?.data?.error || 'Không tải được thông báo';
    notifications.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) fetchNotifs();
  },
);

const filtered = computed(() => {
  if (filter.value === 'unread') {
    return notifications.value.filter((n) => !readIds.value.includes(n.id));
  }
  return notifications.value;
});

const unreadCount = computed(() =>
  notifications.value.filter((n) => !readIds.value.includes(n.id)).length,
);

function markRead(id) {
  if (!readIds.value.includes(id)) {
    readIds.value = [...readIds.value, id];
    persistReadIds();
  }
}

function markAllRead() {
  readIds.value = notifications.value.map((n) => n.id);
  persistReadIds();
}

function iconForType(type) {
  // type from backend: warning/info/error
  if (type === 'error') return { emoji: '⚠️', cls: 'bg-red-50 text-red-700' };
  if (type === 'warning') return { emoji: '🔔', cls: 'bg-amber-50 text-amber-700' };
  return { emoji: 'ℹ️', cls: 'bg-royal-50 text-royal-700' };
}

function relativeTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Vừa xong';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  return `${months} tháng trước`;
}

function close() {
  emit('close');
}

defineExpose({ unreadCount });
</script>

<template>
  <Teleport to="body">
    <!-- Overlay -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-black/40 z-40"
        @click="close"
      />
    </Transition>

    <!-- Drawer -->
    <Transition
      enter-active-class="transition-transform duration-300"
      leave-active-class="transition-transform duration-300"
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-pop z-50 flex flex-col"
        style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom)"
      >
        <!-- Header -->
        <div class="h-14 px-4 flex items-center justify-between border-b border-line-200 shrink-0">
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-ink-primary text-base">Thông báo</h3>
            <span
              v-if="unreadCount > 0"
              class="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {{ unreadCount }}
            </span>
          </div>
          <button
            @click="close"
            class="w-9 h-9 rounded-btn hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
            aria-label="Đóng"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Filter row -->
        <div class="px-4 py-2 border-b border-line-200 flex items-center justify-between gap-2 shrink-0">
          <div class="flex gap-1.5">
            <button
              @click="filter = 'all'"
              class="h-7 px-3 rounded-full text-xs font-semibold border transition"
              :class="filter === 'all' ? 'bg-royal-700 text-white border-royal-700' : 'bg-white text-ink-primary border-line-300'"
            >
              Tất cả ({{ notifications.length }})
            </button>
            <button
              @click="filter = 'unread'"
              class="h-7 px-3 rounded-full text-xs font-semibold border transition"
              :class="filter === 'unread' ? 'bg-royal-700 text-white border-royal-700' : 'bg-white text-ink-primary border-line-300'"
            >
              Chưa đọc ({{ unreadCount }})
            </button>
          </div>
          <button
            v-if="unreadCount > 0"
            @click="markAllRead"
            class="text-xs text-royal-700 hover:text-royal-800 font-semibold"
          >
            Đánh dấu đã đọc
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="loading" class="p-4 space-y-2.5">
            <div v-for="i in 4" :key="i" class="h-16 bg-surface-soft rounded-card animate-pulse"></div>
          </div>

          <div v-else-if="errMsg" class="p-6 text-center">
            <div class="text-3xl mb-2">⚠️</div>
            <div class="text-sm text-red-600">{{ errMsg }}</div>
            <button @click="fetchNotifs" class="mt-3 text-xs text-royal-700 underline font-semibold">
              Thử lại
            </button>
          </div>

          <div v-else-if="filtered.length === 0" class="p-10 text-center">
            <div class="text-5xl mb-3">🔔</div>
            <div class="font-semibold text-ink-primary text-sm">Không có thông báo mới</div>
            <p class="text-xs text-ink-secondary mt-1">
              {{ filter === 'unread' ? 'Tất cả thông báo đã đọc' : 'Quay lại sau nhé' }}
            </p>
          </div>

          <div v-else class="p-3 space-y-2">
            <button
              v-for="n in filtered"
              :key="n.id"
              @click="markRead(n.id)"
              class="w-full flex items-start gap-3 p-3 rounded-card border text-left transition"
              :class="readIds.includes(n.id) ? 'bg-white border-line-200 hover:bg-surface-soft' : 'bg-royal-50/40 border-royal-100 hover:bg-royal-50'"
            >
              <div
                class="w-9 h-9 rounded-card flex items-center justify-center text-base shrink-0"
                :class="iconForType(n.type).cls"
              >
                {{ iconForType(n.type).emoji }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-ink-primary leading-snug">{{ n.title }}</div>
                <div v-if="n.detail" class="text-xs text-ink-secondary mt-0.5 leading-snug">
                  {{ n.detail }}
                </div>
                <div class="text-[11px] text-ink-disabled mt-1">{{ relativeTime(n.createdAt) }}</div>
              </div>
              <span
                v-if="!readIds.includes(n.id)"
                class="w-2 h-2 rounded-full bg-royal-700 shrink-0 mt-2"
                aria-label="Chưa đọc"
              />
            </button>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
