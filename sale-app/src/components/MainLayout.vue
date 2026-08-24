<script setup>
import Sidebar from './Sidebar.vue';
import TopBar from './TopBar.vue';
import BottomNav from './BottomNav.vue';

/**
 * Giữ nguyên các màn DANH SÁCH khi chuyển qua lại (25/8/2026).
 *
 * Trước đây rời màn là component bị huỷ → quay lại phải gọi lại toàn bộ API
 * (~85ms/lần vì máy chủ ở Singapore), mất luôn bộ lọc và vị trí đang cuộn.
 * <KeepAlive> giữ nguyên state; `use-screen-cache` lo làm mới ngầm nếu dữ liệu cũ.
 *
 * Tên trong danh sách = tên FILE của view (Vue tự suy ra với <script setup>).
 *
 * ⛔ Cố ý KHÔNG giữ: Debt + Inventory (tiền và tồn kho — sai số là sai thật),
 * OrderDetail/ImportDetail (mỗi lần một đơn khác nhau), POS (giỏ hàng đã nằm ở
 * store riêng), Login/Account/Settings (ít dùng, giữ chỉ tốn bộ nhớ).
 */
const KEEP_ALIVE_VIEWS = [
  'Home',
  'Orders',
  'Customers',
  'Products',
  'VatIssue',
  'FollowUp',
  'ImportsList',
  'Promotions',
];
</script>

<template>
  <div class="min-h-[100dvh] bg-surface-50 lg:flex">
    <Sidebar />

    <div class="flex-1 min-w-0 flex flex-col">
      <TopBar />
      <main class="flex-1 pb-24 lg:pb-6">
        <router-view v-slot="{ Component }">
          <KeepAlive :include="KEEP_ALIVE_VIEWS" :max="8">
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </main>
    </div>

    <BottomNav />
  </div>
</template>
