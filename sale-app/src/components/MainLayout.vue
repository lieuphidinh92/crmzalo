<script setup>
import Sidebar from './Sidebar.vue';
import TopBar from './TopBar.vue';
import BottomNav from './BottomNav.vue';
</script>

<template>
  <div class="min-h-[100dvh] bg-surface-50 lg:flex">
    <Sidebar />

    <div class="flex-1 min-w-0 flex flex-col">
      <TopBar />
      <main class="flex-1 pb-24 lg:pb-6">
        <router-view />
      </main>
    </div>

    <BottomNav />
  </div>
</template>
