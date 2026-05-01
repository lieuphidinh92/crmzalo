<template>
  <v-card variant="flat" class="pa-4">
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <h3 class="text-h6 font-weight-bold">Mục tiêu cadence theo tuần</h3>
        <p class="text-caption text-medium-emphasis ma-0">
          Số này dùng để tính "Tiến độ tuần" trên Dashboard cá nhân
        </p>
      </div>
      <v-btn
        color="primary"
        variant="flat"
        :loading="saving"
        prepend-icon="mdi-content-save"
        @click="onSave"
      >
        Lưu thay đổi
      </v-btn>
    </div>

    <div v-if="loading" class="d-flex justify-center pa-12">
      <v-progress-circular indeterminate color="amber" />
    </div>

    <v-row v-else>
      <v-col v-for="role in roles" :key="role.key" cols="12" md="6">
        <v-card variant="outlined" class="pa-4">
          <h4 class="text-subtitle-1 font-weight-bold mb-3">{{ role.label }}</h4>
          <div class="targets-grid">
            <v-text-field
              v-for="m in metrics"
              :key="m.key"
              v-model.number="local[role.key][m.key]"
              :label="m.label"
              type="number"
              min="0"
              variant="outlined"
              density="compact"
              hide-details="auto"
              :hint="m.hint"
              persistent-hint
            />
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, watch } from 'vue';
import {
  useCadenceTargets,
  type CadenceTargetSet,
  type CadenceTargets,
} from '@/composables/use-cadence-targets';

const { targets, loading, saving, fetchTargets, updateTargets } = useCadenceTargets();

const roles: Array<{ key: keyof CadenceTargets; label: string }> = [
  { key: 'member', label: 'Sale (member)' },
  { key: 'admin', label: 'Admin / Owner' },
];

const metrics: Array<{ key: keyof CadenceTargetSet; label: string; hint: string }> = [
  { key: 'posts', label: 'Số bài đăng FB/Zalo / tuần', hint: 'Default 14' },
  { key: 'interacts', label: 'Số tương tác KH / tuần', hint: 'Default 45' },
  { key: 'learning', label: 'Số module học / tuần', hint: 'Default 1' },
  { key: 'reports', label: 'Số báo cáo ngày / tuần', hint: 'Default 5' },
];

const local = reactive<CadenceTargets>({
  member: { posts: 0, interacts: 0, learning: 0, reports: 0 },
  admin: { posts: 0, interacts: 0, learning: 0, reports: 0 },
});

watch(
  targets,
  (val) => {
    if (!val) return;
    Object.assign(local.member, val.member);
    Object.assign(local.admin, val.admin);
  },
  { immediate: true },
);

async function onSave() {
  await updateTargets({
    member: { ...local.member },
    admin: { ...local.admin },
  });
}

onMounted(() => fetchTargets());
</script>

<style scoped>
.targets-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
</style>
