<script setup>
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const titles = {
  '/products': { title: 'Sản phẩm', desc: 'Danh mục SP với giá sỉ, giá lẻ và tồn kho.' },
  '/orders': { title: 'Đơn hàng', desc: 'Danh sách đơn + trạng thái + xử lý.' },
  '/account': { title: 'Tài khoản', desc: 'Hồ sơ cá nhân, KPI, mục tiêu tháng, đổi mật khẩu.' },
  '/customers': { title: 'Khách hàng', desc: 'Quản lý KH B2B + lịch sử mua + công nợ.' },
  '/inventory': { title: 'Tồn kho', desc: 'Tồn theo lô, HSD, dự trữ, cảnh báo.' },
  '/promotions': { title: 'Khuyến mãi', desc: 'Cấu hình rules + lịch sử áp dụng.' },
  '/reports': { title: 'Báo cáo', desc: 'Doanh số, retention, chiến dịch.' },
  '/settings': { title: 'Cài đặt', desc: 'Cấu hình app + thông báo + đồng bộ.' },
};

const info = titles[route.path] || { title: 'Sắp ra mắt', desc: 'Tính năng đang phát triển.' };
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center px-4">
    <div class="max-w-md text-center">
      <div class="w-20 h-20 mx-auto mb-4 rounded-2xl bg-royal-50 flex items-center justify-center">
        <svg class="w-10 h-10 text-royal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-ink-primary mb-2">{{ info.title }} — sắp ra mắt</h1>
      <p class="text-sm text-ink-secondary mb-6">{{ info.desc }}</p>
      <div class="flex gap-2 justify-center">
        <button @click="router.push('/')" class="h-10 px-4 rounded-lg border border-line-300 text-sm font-medium text-ink-primary hover:bg-surface-50">
          Về trang chủ
        </button>
        <button @click="router.push('/pos')" class="h-10 px-4 rounded-lg bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold shadow-pop">
          Tạo đơn ngay
        </button>
      </div>
    </div>
  </div>
</template>
