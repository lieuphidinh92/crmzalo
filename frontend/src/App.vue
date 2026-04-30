<template>
  <Suspense>
    <component :is="layout" v-if="ready">
      <router-view />
    </component>
    <template #fallback>
      <div style="height:100vh;display:flex;align-items:center;justify-content:center;background:var(--brand-navy-900);">
        <BrandLogo variant="stacked" :size="96" theme="dark" />
      </div>
    </template>
  </Suspense>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import AuthLayout from '@/layouts/AuthLayout.vue';
import BrandLogo from '@/components/BrandLogo.vue';

const route = useRoute();
const authStore = useAuthStore();
const ready = ref(false);

const layout = computed(() => {
  return route.meta.layout === 'auth' ? AuthLayout : DefaultLayout;
});

// Initialize auth state before rendering to prevent layout flicker
onMounted(async () => {
  if (authStore.token) {
    await authStore.init();
  }
  ready.value = true;
});
</script>
