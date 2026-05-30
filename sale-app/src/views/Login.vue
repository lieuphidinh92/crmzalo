<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

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
  <div class="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-orange-50 to-white px-4">
    <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <div class="text-center mb-8">
        <div class="w-16 h-16 rounded-2xl bg-brand-500 text-white text-3xl font-bold mx-auto flex items-center justify-center mb-4 shadow-lg shadow-orange-200">
          S
        </div>
        <h1 class="text-2xl font-bold text-gray-900">HaloVN Sale Lite</h1>
        <p class="text-sm text-gray-500 mt-1">App bán hàng nhanh cho team Sale</p>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="admin@local.dev"
            class="w-full h-12 px-4 rounded-xl border border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
            :disabled="loading"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            class="w-full h-12 px-4 rounded-xl border border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
            :disabled="loading"
          />
        </div>

        <div v-if="errorMsg" class="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {{ errorMsg }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full h-12 rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-200"
        >
          {{ loading ? 'Đang đăng nhập...' : 'Đăng nhập' }}
        </button>
      </form>

      <p class="text-xs text-gray-400 text-center mt-6">
        Dùng tài khoản CRM của bạn để đăng nhập
      </p>
    </div>
  </div>
</template>
