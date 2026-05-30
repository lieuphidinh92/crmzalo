<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api/client';
import FollowUpRow from '../components/FollowUpRow.vue';

const customers = ref([]);
const total = ref(0);
const loading = ref(false);
const errorMsg = ref('');

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get('/sale-app/follow-up/customers');
    customers.value = data.customers || [];
    total.value = data.total ?? customers.value.length;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được danh sách khách cần chăm sóc';
    customers.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="mb-4">
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Khách cần chăm sóc</h1>
      <p class="text-xs text-ink-secondary mt-0.5">
        Đại lý hơn 30 ngày chưa đặt lại · {{ total.toLocaleString('vi-VN') }} khách
      </p>
    </div>

    <!-- Skeleton loading -->
    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 6" :key="i" class="bg-white border border-line-200 rounded-card h-20 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <!-- Empty state -->
    <div v-else-if="customers.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Tuyệt vời! Không có khách nào nguội</div>
      <p class="text-xs text-ink-secondary mt-1">Mọi đại lý đều đã đặt hàng trong 30 ngày gần đây.</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-2.5">
      <FollowUpRow
        v-for="c in customers"
        :key="c.id"
        :customer="c"
      />
    </div>
  </div>
</template>
