<script setup>
import { ref } from 'vue';
import { api } from '../api/client';

const emit = defineEmits(['close', 'created']);

const form = ref({
  fullName: '',
  phone: '',
  storeName: '',
  province: '',
  policyTier: 'dai_ly_cap_1',
});
const loading = ref(false);
const errorMsg = ref('');

async function submit() {
  if (!form.value.fullName.trim()) {
    errorMsg.value = 'Vui lòng nhập tên';
    return;
  }
  if (!form.value.phone.trim()) {
    errorMsg.value = 'Vui lòng nhập SĐT';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.post('/sale-app/customers', form.value);
    emit('created', data.customer);
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Lỗi tạo KH';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-gray-900">Tạo khách hàng mới</h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
      </div>

      <form @submit.prevent="submit" class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Tên KH *</label>
          <input v-model="form.fullName" class="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-brand-500 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Số điện thoại *</label>
          <input v-model="form.phone" type="tel" class="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-brand-500 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Tên cửa hàng</label>
          <input v-model="form.storeName" class="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-brand-500 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Tỉnh / TP</label>
          <input v-model="form.province" class="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-brand-500 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Bảng giá</label>
          <select v-model="form.policyTier" class="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-brand-500 outline-none bg-white">
            <option value="ctv">CTV</option>
            <option value="dai_ly_cap_1">Đại lý cấp 1</option>
            <option value="dai_ly_cap_2">Đại lý cấp 2 (VIP)</option>
          </select>
        </div>

        <div v-if="errorMsg" class="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {{ errorMsg }}
        </div>

        <div class="flex gap-2 pt-2">
          <button
            type="button"
            @click="emit('close')"
            class="flex-1 h-11 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
            :disabled="loading"
          >
            Huỷ
          </button>
          <button
            type="submit"
            class="flex-1 h-11 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold disabled:opacity-50"
            :disabled="loading"
          >
            {{ loading ? 'Đang tạo...' : 'Tạo' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
