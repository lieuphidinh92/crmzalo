<script setup>
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';

const auth = useAuthStore();

onMounted(async () => {
  auth.loadFromStorage();
  if (auth.token) { try { await auth.fetchProfile(); } catch { /* Keep cached profile on transient network errors. */ } }
});
</script>

<template>
  <router-view />
</template>
