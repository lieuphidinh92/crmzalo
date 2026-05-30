<script setup>
import { ref } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const props = defineProps({
  user: { type: Object, required: true },
});
const emit = defineEmits(['close', 'saved']);

const auth = useAuthStore();

const form = ref({
  fullName: props.user?.fullName ?? '',
  email: props.user?.email ?? '',
});
const loading = ref(false);
const errorMsg = ref('');

async function submit() {
  if (!form.value.fullName.trim()) {
    errorMsg.value = 'Vui lòng nhập họ tên';
    return;
  }
  if (!form.value.email.trim() || !form.value.email.includes('@')) {
    errorMsg.value = 'Email không hợp lệ';
    return;
  }

  loading.value = true;
  errorMsg.value = '';
  try {
    await api.put(`/users/${props.user.id}`, {
      fullName: form.value.fullName.trim(),
      email: form.value.email.trim(),
    });
    // Pull a fresh profile so the header/sidebar show the updated name immediately.
    await auth.fetchProfile();
    emit('saved');
    emit('close');
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Lưu hồ sơ thất bại';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <div class="bg-white rounded-modal w-full max-w-md p-5 shadow-pop">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-ink-primary">Sửa hồ sơ</h3>
        <button @click="emit('close')" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
      </div>

      <form @submit.prevent="submit" class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-ink-primary mb-1">Họ và tên *</label>
          <input
            v-model="form.fullName"
            type="text"
            class="w-full h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-primary mb-1">Email *</label>
          <input
            v-model="form.email"
            type="email"
            class="w-full h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none"
          />
        </div>

        <div v-if="errorMsg" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-input px-3 py-2">
          {{ errorMsg }}
        </div>

        <div class="flex gap-2 pt-2">
          <button
            type="button"
            @click="emit('close')"
            class="flex-1 h-11 rounded-btn border border-line-300 text-ink-primary font-medium hover:bg-surface-50"
            :disabled="loading"
          >
            Huỷ
          </button>
          <button
            type="submit"
            class="flex-1 h-11 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50"
            :disabled="loading"
          >
            {{ loading ? 'Đang lưu...' : 'Lưu' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
