<template>
  <div>
    <!-- Toggle for admin/owner — view as Sale -->
    <div
      v-if="canToggle"
      class="d-flex align-center mb-3"
      style="gap: 8px;"
    >
      <v-spacer />
      <v-btn-toggle
        v-model="viewMode"
        density="compact"
        variant="outlined"
        divided
        mandatory
      >
        <v-btn value="admin" size="small">
          <v-icon start size="16">mdi-view-dashboard-variant</v-icon>
          Tổng quan điều hành
        </v-btn>
        <v-btn value="personal" size="small">
          <v-icon start size="16">mdi-account-eye-outline</v-icon>
          Xem theo góc nhìn Sale
        </v-btn>
      </v-btn-toggle>
    </div>

    <component :is="dashboardComponent" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminDashboard from '@/components/home/AdminDashboard.vue';
import PersonalDashboard from '@/components/home/PersonalDashboard.vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const isAdminOrOwner = computed(
  () =>
    authStore.user?.role === 'owner' || authStore.user?.role === 'admin',
);

// Future: when 'leader' role exists, treat it like admin here.
// const isLeader = computed(() => authStore.user?.role === 'leader');

const canToggle = computed(() => isAdminOrOwner.value);

const viewMode = ref<'admin' | 'personal'>(
  isAdminOrOwner.value ? 'admin' : 'personal',
);

const dashboardComponent = computed(() => {
  if (viewMode.value === 'admin' && isAdminOrOwner.value) {
    return AdminDashboard;
  }
  return PersonalDashboard;
});
</script>
