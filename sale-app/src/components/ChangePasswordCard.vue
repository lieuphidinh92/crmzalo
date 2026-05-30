<script setup>
import { ref, computed } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
// Backend endpoint PUT /api/v1/users/:id/password is owner/admin only and
// only accepts `{ password }`. There's no self-serve endpoint yet, so we
// gate the whole card to owner/admin to avoid a guaranteed 403 for members.
const canChange = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const form = ref({ current: '', next: '', confirm: '' });
const showCurrent = ref(false);
const showNext = ref(false);
const showConfirm = ref(false);

const loading = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

const validationError = computed(() => {
  if (!form.value.current) return 'Nhập mật khẩu hiện tại';
  if (!form.value.next) return 'Nhập mật khẩu mới';
  if (form.value.next.length < 8) return 'Mật khẩu mới tối thiểu 8 ký tự';
  if (!/[A-Za-z]/.test(form.value.next) || !/\d/.test(form.value.next)) {
    return 'Mật khẩu mới cần ít nhất 1 chữ và 1 số';
  }
  if (form.value.next === form.value.current) return 'Mật khẩu mới phải khác hiện tại';
  if (form.value.next !== form.value.confirm) return 'Xác nhận mật khẩu không khớp';
  return '';
});

const canSubmit = computed(() => !loading.value && !validationError.value);

async function submit() {
  if (validationError.value) {
    errorMsg.value = validationError.value;
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    await api.put(`/users/${auth.user.id}/password`, {
      password: form.value.next,
    });
    successMsg.value = 'Đã đổi mật khẩu thành công';
    form.value = { current: '', next: '', confirm: '' };
    setTimeout(() => (successMsg.value = ''), 3000);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) errorMsg.value = 'Phiên đăng nhập đã hết hạn';
    else if (status === 403) errorMsg.value = 'Không có quyền đổi mật khẩu';
    else errorMsg.value = err.response?.data?.error || 'Đổi mật khẩu thất bại';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="bg-white border border-line-200 rounded-card shadow-card p-5">
    <h2 class="text-base font-semibold text-ink-primary mb-3">Đổi mật khẩu</h2>

    <div
      v-if="!canChange"
      class="bg-amber-50 border border-amber-200 text-amber-800 rounded-input p-3 text-sm"
    >
      Tài khoản Sale hiện chưa hỗ trợ tự đổi mật khẩu. Vui lòng liên hệ quản lý để được hỗ trợ.
    </div>

    <form v-else @submit.prevent="submit" class="space-y-3">
      <div>
        <label class="block text-xs uppercase tracking-wide text-ink-secondary mb-1">Mật khẩu hiện tại</label>
        <div class="relative">
          <input
            v-model="form.current"
            :type="showCurrent ? 'text' : 'password'"
            autocomplete="current-password"
            class="w-full h-11 pl-3 pr-12 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none"
          />
          <button
            type="button"
            @click="showCurrent = !showCurrent"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-secondary hover:text-royal-700 px-2 h-7"
          >
            {{ showCurrent ? 'Ẩn' : 'Hiện' }}
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs uppercase tracking-wide text-ink-secondary mb-1">Mật khẩu mới</label>
        <div class="relative">
          <input
            v-model="form.next"
            :type="showNext ? 'text' : 'password'"
            autocomplete="new-password"
            class="w-full h-11 pl-3 pr-12 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none"
          />
          <button
            type="button"
            @click="showNext = !showNext"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-secondary hover:text-royal-700 px-2 h-7"
          >
            {{ showNext ? 'Ẩn' : 'Hiện' }}
          </button>
        </div>
        <p class="text-[11px] text-ink-secondary mt-1">Tối thiểu 8 ký tự, có chữ và số.</p>
      </div>

      <div>
        <label class="block text-xs uppercase tracking-wide text-ink-secondary mb-1">Xác nhận mật khẩu mới</label>
        <div class="relative">
          <input
            v-model="form.confirm"
            :type="showConfirm ? 'text' : 'password'"
            autocomplete="new-password"
            class="w-full h-11 pl-3 pr-12 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none"
          />
          <button
            type="button"
            @click="showConfirm = !showConfirm"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-secondary hover:text-royal-700 px-2 h-7"
          >
            {{ showConfirm ? 'Ẩn' : 'Hiện' }}
          </button>
        </div>
      </div>

      <div v-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-input px-3 py-2 text-sm">
        {{ errorMsg }}
      </div>
      <div v-if="successMsg" class="bg-green-50 border border-green-200 text-green-700 rounded-input px-3 py-2 text-sm">
        {{ successMsg }}
      </div>

      <div class="pt-1">
        <button
          type="submit"
          :disabled="!canSubmit"
          class="bg-royal-700 hover:bg-royal-800 text-white h-11 rounded-btn px-4 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ loading ? 'Đang lưu...' : 'Cập nhật mật khẩu' }}
        </button>
      </div>
    </form>
  </section>
</template>
