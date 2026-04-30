<template>
  <v-snackbar
    v-model="show"
    :timeout="-1"
    location="bottom"
    color="surface-variant"
    elevation="6"
    rounded="lg"
    class="nds-offline-snackbar"
  >
    <div class="d-flex align-center">
      <v-icon
        :icon="online ? 'mdi-server-network-off' : 'mdi-wifi-off'"
        color="warning"
        class="mr-2"
      />
      <span class="text-body-2">
        {{ online ? 'Mất kết nối tới máy chủ' : 'Đang ngoại tuyến' }}
      </span>
    </div>
    <template #actions>
      <v-btn
        v-if="online"
        variant="text"
        color="primary"
        size="small"
        :loading="retrying"
        @click="retry"
      >
        Thử lại
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useOnlineStatus } from '@/composables/use-online-status';

const { online, apiReachable, checkApi } = useOnlineStatus();
const retrying = ref(false);

const show = computed({
  get: () => !online.value || !apiReachable.value,
  set: () => {
    /* sticky — reopens until connection is restored */
  },
});

async function retry() {
  retrying.value = true;
  try {
    await checkApi();
  } finally {
    retrying.value = false;
  }
}
</script>

<style scoped>
.nds-offline-snackbar :deep(.v-snackbar__wrapper) {
  border: 1px solid var(--brand-amber-500);
}
</style>
