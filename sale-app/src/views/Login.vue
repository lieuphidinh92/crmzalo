<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import BrandLogo from '../components/BrandLogo.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');

async function submit() {
  if (!email.value || !password.value) {
    errorMsg.value = 'Vui lòng nhập email và mật khẩu';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    await auth.login(email.value.trim(), password.value);
    const redirect = route.query.redirect || '/';
    router.replace(redirect);
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Đăng nhập thất bại';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-[100dvh] lg:grid lg:grid-cols-2 bg-surface-50">
    <!-- Left brand panel (desktop only) -->
    <div class="hidden lg:flex bg-navy-900 text-white p-12 flex-col justify-between relative overflow-hidden">
      <div class="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-royal-700/30 blur-3xl"></div>
      <div class="absolute -left-20 -bottom-20 w-72 h-72 rounded-full bg-amber-500/20 blur-3xl"></div>

      <div class="relative">
        <BrandLogo size="lg" theme="dark" :show-tagline="true" />
      </div>

      <div class="relative">
        <h2 class="text-3xl font-bold leading-tight mb-3">
          App bán hàng cho team Sale
        </h2>
        <p class="text-slate-300 text-sm leading-relaxed max-w-md">
          Tạo đơn nhanh, kiểm tra tồn kho, theo dõi công nợ và doanh số —
          tất cả trong 1 app duy nhất.
        </p>
        <div class="mt-6 flex gap-2 flex-wrap">
          <span class="px-3 py-1.5 rounded-full bg-white/10 text-xs font-medium">⚡ Nhanh</span>
          <span class="px-3 py-1.5 rounded-full bg-white/10 text-xs font-medium">👍 Đơn giản</span>
          <span class="px-3 py-1.5 rounded-full bg-white/10 text-xs font-medium">🎯 Hiệu quả</span>
        </div>
      </div>

      <div class="relative text-xs text-slate-400">
        © {{ new Date().getFullYear() }} HaloVN · ngheduocsi.vn
      </div>
    </div>

    <!-- Right form panel -->
    <div class="flex items-center justify-center px-4 py-8 lg:px-12">
      <div class="w-full max-w-sm">
        <!-- Mobile brand -->
        <div class="lg:hidden mb-8 flex justify-center">
          <BrandLogo size="xl" theme="light" :show-tagline="true" />
        </div>

        <div class="hidden lg:block mb-8">
          <h1 class="text-2xl font-bold text-ink-primary">Đăng nhập</h1>
          <p class="text-sm text-ink-secondary mt-1">Dùng tài khoản nội bộ HaloVN</p>
        </div>

        <form @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink-primary mb-1.5">Email</label>
            <input
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="ten.ban@halo.com.vn"
              class="w-full h-12 px-4 rounded-lg border border-line-300 bg-white focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none transition"
              :disabled="loading"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-primary mb-1.5">Mật khẩu</label>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full h-12 px-4 rounded-lg border border-line-300 bg-white focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none transition"
              :disabled="loading"
            />
          </div>

          <div v-if="errorMsg" class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ errorMsg }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full h-12 rounded-lg bg-royal-700 hover:bg-royal-800 text-white font-semibold transition disabled:opacity-50 shadow-pop"
          >
            {{ loading ? 'Đang đăng nhập...' : 'Đăng nhập' }}
          </button>
        </form>

        <p class="text-xs text-ink-secondary text-center mt-6 lg:text-left">
          Cần hỗ trợ? Gọi 1900 636 925 (T2–T7 · 8:00–17:30)
        </p>
      </div>
    </div>
  </div>
</template>
