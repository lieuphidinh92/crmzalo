<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatVNDShort } from '../composables/useFormat';
import {
  useAccount,
  roleLabel,
  initialsOf,
  getPref,
  setPref,
} from '../composables/useAccount';
import EditProfileDialog from '../components/EditProfileDialog.vue';
import ChangePasswordCard from '../components/ChangePasswordCard.vue';

const auth = useAuthStore();

const {
  loadingKpi,
  loadingGoals,
  monthRevenue,
  monthOrders,
  monthCustomers,
  monthAov,
  monthLabel,
  ytdRevenue,
  annualGoal,
  goalProgressPct,
  loadAll,
} = useAccount();

const showEdit = ref(false);
const showLogoutConfirm = ref(false);
const toast = ref('');

const user = computed(() => auth.user ?? {});
const canEditProfile = computed(() => ['owner', 'admin'].includes(user.value.role));
const initials = computed(() => initialsOf(user.value.fullName));
const role = computed(() => roleLabel(user.value.role));
const orgName = computed(() => user.value.org?.name ?? null);

const prefs = ref({
  vibrate: getPref('sale_app_notif_vibrate'),
  sound: getPref('sale_app_notif_sound'),
  confetti: getPref('sale_app_confetti'),
});

function togglePref(key, storageKey) {
  prefs.value[key] = !prefs.value[key];
  setPref(storageKey, prefs.value[key]);
}

function onProfileSaved() {
  toast.value = 'Đã cập nhật hồ sơ';
  setTimeout(() => (toast.value = ''), 2500);
}

function confirmLogout() {
  showLogoutConfirm.value = false;
  auth.logout();
}

onMounted(loadAll);
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-3xl mx-auto">
    <div class="mb-5">
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Tài khoản</h1>
      <p class="text-sm text-ink-secondary mt-0.5">Hồ sơ cá nhân &amp; thiết lập</p>
    </div>

    <div v-if="toast" class="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-input px-3 py-2 text-sm">
      {{ toast }}
    </div>

    <div class="space-y-4">
      <!-- 1. Profile card -->
      <section class="bg-white border border-line-200 rounded-card shadow-card p-5">
        <div class="flex items-start gap-4">
          <div class="w-14 h-14 rounded-full bg-royal-700 text-white flex items-center justify-center text-xl font-bold shrink-0">
            {{ initials }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-lg font-bold text-ink-primary truncate">{{ user.fullName || '—' }}</div>
                <div class="text-sm text-ink-secondary truncate">{{ user.email || '—' }}</div>
              </div>
              <span class="shrink-0 inline-flex items-center px-2.5 h-7 rounded-full bg-royal-50 text-royal-700 text-xs font-semibold">
                {{ role }}
              </span>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div v-if="orgName">
                <div class="text-xs uppercase tracking-wide text-ink-secondary mb-0.5">Tổ chức</div>
                <div class="font-medium text-ink-primary truncate">{{ orgName }}</div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-ink-secondary mb-0.5">Trạng thái</div>
                <div class="font-medium" :class="user.isActive === false ? 'text-red-600' : 'text-green-600'">
                  {{ user.isActive === false ? 'Đã khoá' : 'Đang hoạt động' }}
                </div>
              </div>
            </div>

            <div v-if="canEditProfile" class="mt-4">
              <button
                @click="showEdit = true"
                class="h-10 px-4 rounded-btn border border-line-300 hover:border-royal-700 hover:text-royal-700 text-sm font-semibold text-ink-primary"
              >
                Sửa hồ sơ
              </button>
            </div>
            <p v-else class="mt-4 text-xs text-ink-secondary">
              Liên hệ quản lý để thay đổi thông tin tài khoản.
            </p>
          </div>
        </div>
      </section>

      <!-- 2. KPI tháng này -->
      <section class="bg-white border border-line-200 rounded-card shadow-card p-5">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-semibold text-ink-primary">KPI {{ monthLabel.toLowerCase() }}</h2>
        </div>

        <div v-if="loadingKpi" class="grid grid-cols-2 gap-3">
          <div v-for="i in 4" :key="i" class="h-20 rounded-input bg-surface-50 animate-pulse"></div>
        </div>

        <div v-else class="grid grid-cols-2 gap-3">
          <div class="rounded-input border border-line-200 p-3">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">Doanh số</div>
            <div class="text-lg font-bold text-royal-700 mt-1">{{ formatVND(monthRevenue) }}</div>
          </div>
          <div class="rounded-input border border-line-200 p-3">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">Số đơn</div>
            <div class="text-lg font-bold text-ink-primary mt-1">{{ monthOrders.toLocaleString('vi-VN') }}</div>
          </div>
          <div class="rounded-input border border-line-200 p-3">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">KH có đơn</div>
            <div class="text-lg font-bold text-ink-primary mt-1">{{ monthCustomers.toLocaleString('vi-VN') }}</div>
          </div>
          <div class="rounded-input border border-line-200 p-3">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary">AOV</div>
            <div class="text-lg font-bold text-ink-primary mt-1">{{ formatVND(monthAov) }}</div>
          </div>
        </div>
      </section>

      <!-- 3. Mục tiêu năm -->
      <section class="bg-white border border-line-200 rounded-card shadow-card p-5">
        <h2 class="text-base font-semibold text-ink-primary mb-3">Mục tiêu năm</h2>

        <div v-if="loadingGoals" class="h-16 rounded-input bg-surface-50 animate-pulse"></div>

        <div v-else-if="!annualGoal" class="text-sm text-ink-secondary">
          Chưa cấu hình mục tiêu doanh số năm. Quản lý có thể đặt mục tiêu trong Cài đặt → Mục tiêu kinh doanh.
        </div>

        <div v-else>
          <div class="flex items-baseline justify-between gap-3 mb-2">
            <div>
              <div class="text-xs uppercase tracking-wide text-ink-secondary">Doanh số YTD</div>
              <div class="text-lg font-bold text-ink-primary">{{ formatVND(ytdRevenue) }}</div>
            </div>
            <div class="text-right">
              <div class="text-xs uppercase tracking-wide text-ink-secondary">Mục tiêu năm</div>
              <div class="text-lg font-bold text-royal-700">{{ formatVNDShort(annualGoal) }}</div>
            </div>
          </div>

          <div class="bg-line-200 h-2 rounded-full overflow-hidden">
            <div
              class="h-full bg-royal-700 transition-all duration-500"
              :style="{ width: goalProgressPct + '%' }"
            ></div>
          </div>
          <div class="mt-1.5 text-xs text-ink-secondary text-right">
            {{ goalProgressPct.toFixed(1) }}% hoàn thành
          </div>
        </div>
      </section>

      <!-- 4. Preferences -->
      <section class="bg-white border border-line-200 rounded-card shadow-card p-5">
        <h2 class="text-base font-semibold text-ink-primary mb-3">Cài đặt cá nhân</h2>
        <p class="text-xs text-ink-secondary mb-3">Tuỳ chỉnh được lưu trên thiết bị này.</p>

        <div class="divide-y divide-line-200">
          <label class="flex items-center justify-between py-3 cursor-pointer">
            <div class="pr-3">
              <div class="text-sm font-medium text-ink-primary">Rung khi có thông báo</div>
              <div class="text-xs text-ink-secondary">Thiết bị sẽ rung nhẹ khi có tin nhắn / đơn mới.</div>
            </div>
            <button
              type="button"
              @click="togglePref('vibrate', 'sale_app_notif_vibrate')"
              :class="prefs.vibrate ? 'bg-royal-700' : 'bg-line-300'"
              class="relative w-11 h-6 rounded-full transition-colors shrink-0"
              :aria-pressed="prefs.vibrate"
            >
              <span
                class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                :class="prefs.vibrate ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </label>

          <label class="flex items-center justify-between py-3 cursor-pointer">
            <div class="pr-3">
              <div class="text-sm font-medium text-ink-primary">Âm thanh thông báo</div>
              <div class="text-xs text-ink-secondary">Phát âm thanh ngắn khi có tin mới.</div>
            </div>
            <button
              type="button"
              @click="togglePref('sound', 'sale_app_notif_sound')"
              :class="prefs.sound ? 'bg-royal-700' : 'bg-line-300'"
              class="relative w-11 h-6 rounded-full transition-colors shrink-0"
              :aria-pressed="prefs.sound"
            >
              <span
                class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                :class="prefs.sound ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </label>

          <label class="flex items-center justify-between py-3 cursor-pointer">
            <div class="pr-3">
              <div class="text-sm font-medium text-ink-primary">Hiệu ứng confetti khi tạo đơn</div>
              <div class="text-xs text-ink-secondary">Tăng cảm hứng mỗi khi chốt đơn thành công.</div>
            </div>
            <button
              type="button"
              @click="togglePref('confetti', 'sale_app_confetti')"
              :class="prefs.confetti ? 'bg-royal-700' : 'bg-line-300'"
              class="relative w-11 h-6 rounded-full transition-colors shrink-0"
              :aria-pressed="prefs.confetti"
            >
              <span
                class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                :class="prefs.confetti ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </label>
        </div>
      </section>

      <!-- 5. Change password -->
      <ChangePasswordCard />

      <!-- 6. Logout -->
      <section class="bg-white border border-line-200 rounded-card shadow-card p-5">
        <h2 class="text-base font-semibold text-ink-primary mb-1">Phiên đăng nhập</h2>
        <p class="text-xs text-ink-secondary mb-3">Đăng xuất khỏi thiết bị này. Bạn có thể đăng nhập lại bất cứ lúc nào.</p>
        <button
          @click="showLogoutConfirm = true"
          class="border border-red-200 text-red-600 hover:bg-red-50 h-11 rounded-btn px-4 font-semibold"
        >
          Đăng xuất
        </button>
      </section>
    </div>

    <!-- Dialogs -->
    <EditProfileDialog
      v-if="showEdit"
      :user="user"
      @close="showEdit = false"
      @saved="onProfileSaved"
    />

    <div v-if="showLogoutConfirm" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-modal w-full max-w-sm p-5 shadow-pop">
        <h3 class="text-lg font-bold text-ink-primary">Đăng xuất khỏi ứng dụng?</h3>
        <p class="text-sm text-ink-secondary mt-1">Bạn cần đăng nhập lại để tiếp tục dùng app.</p>
        <div class="flex gap-2 mt-4">
          <button
            @click="showLogoutConfirm = false"
            class="flex-1 h-11 rounded-btn border border-line-300 text-ink-primary font-medium hover:bg-surface-50"
          >
            Huỷ
          </button>
          <button
            @click="confirmLogout"
            class="flex-1 h-11 rounded-btn bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
