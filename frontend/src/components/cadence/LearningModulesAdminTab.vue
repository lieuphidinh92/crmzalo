<template>
  <v-card variant="flat" class="pa-4">
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap" style="gap: 12px;">
      <h3 class="text-h6 font-weight-bold">Quản lý module học tập</h3>
      <div class="d-flex" style="gap: 8px;">
        <v-btn variant="outlined" prepend-icon="mdi-chart-box-outline" @click="openTeam">
          📊 Báo cáo tiến độ học
        </v-btn>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="openCreate">
          Thêm module
        </v-btn>
      </div>
    </div>

    <v-data-table
      :headers="headers"
      :items="adminModules"
      :loading="adminLoading"
      density="comfortable"
      no-data-text="Chưa có module nào"
    >
      <template #item.type="{ item }">
        <v-chip
          size="x-small"
          :color="item.type === 'required' ? 'red' : 'green'"
          variant="tonal"
        >
          {{ item.type === 'required' ? 'Bắt buộc' : 'Tự chọn' }}
        </v-chip>
      </template>
      <template #item.forRoles="{ item }">
        <span v-if="!item.forRoles || item.forRoles.length === 0" class="text-medium-emphasis">
          Tất cả
        </span>
        <span v-else>
          <v-chip
            v-for="r in item.forRoles"
            :key="r"
            size="x-small"
            variant="tonal"
            class="mr-1"
          >
            {{ r }}
          </v-chip>
        </span>
      </template>
      <template #item.durationMinutes="{ item }">
        {{ item.durationMinutes }}p
      </template>
      <template #item.completedCount="{ item }">
        {{ item.completedCount }}
        <span v-if="item.inProgressCount" class="text-caption text-medium-emphasis">
          (+{{ item.inProgressCount }} đang học)
        </span>
      </template>
      <template #item.active="{ item }">
        <v-chip
          size="x-small"
          :color="item.active ? 'success' : 'grey'"
          variant="tonal"
        >
          {{ item.active ? 'Bật' : 'Tắt' }}
        </v-chip>
      </template>
      <template #item.actions="{ item }">
        <v-btn icon variant="text" size="small" @click="openEdit(item)">
          <v-icon size="20">mdi-pencil</v-icon>
        </v-btn>
      </template>
    </v-data-table>

    <LearningModuleAdminDialog
      v-model="dialogOpen"
      :module="editingModule"
      @saved="onSaved"
    />

    <v-dialog v-model="teamOpen" max-width="720">
      <v-card>
        <v-card-title>Tiến độ học tập của team</v-card-title>
        <v-card-text>
          <v-data-table
            :headers="teamHeaders"
            :items="teamProgress"
            density="compact"
            no-data-text="Chưa có dữ liệu"
          >
            <template #item.percent="{ item }">
              <div class="d-flex align-center" style="gap: 8px; min-width: 140px;">
                <v-progress-linear
                  :model-value="item.percent"
                  :color="item.percent >= 80 ? 'success' : 'amber'"
                  height="6"
                  rounded
                  style="flex: 1;"
                />
                <span class="text-caption">{{ item.percent }}%</span>
              </div>
            </template>
          </v-data-table>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="teamOpen = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  useLearningAdmin,
  type AdminModule,
} from '@/composables/use-learning';
import LearningModuleAdminDialog from './LearningModuleAdminDialog.vue';

const {
  adminModules,
  adminLoading,
  teamProgress,
  fetchAdminModules,
  fetchTeamProgress,
} = useLearningAdmin();

const headers = [
  { title: 'Tên', key: 'name', sortable: true },
  { title: 'Loại', key: 'type', sortable: false },
  { title: 'Vai trò', key: 'forRoles', sortable: false },
  { title: 'Phút', key: 'durationMinutes', sortable: true, align: 'end' as const },
  { title: 'Đã học', key: 'completedCount', sortable: true, align: 'end' as const },
  { title: 'Trạng thái', key: 'active', sortable: false, align: 'center' as const },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

const teamHeaders = [
  { title: 'Sale', key: 'fullName', sortable: true },
  { title: 'Vai trò', key: 'role', sortable: true },
  { title: 'Đã hoàn thành', key: 'completed', sortable: true, align: 'end' as const },
  { title: 'Đang học', key: 'inProgress', sortable: true, align: 'end' as const },
  { title: 'Chưa BĐ', key: 'notStarted', sortable: true, align: 'end' as const },
  { title: 'Tỷ lệ', key: 'percent', sortable: true },
];

const dialogOpen = ref(false);
const teamOpen = ref(false);
const editingModule = ref<AdminModule | null>(null);

function openCreate() {
  editingModule.value = null;
  dialogOpen.value = true;
}
function openEdit(m: AdminModule) {
  editingModule.value = m;
  dialogOpen.value = true;
}
async function openTeam() {
  await fetchTeamProgress();
  teamOpen.value = true;
}
function onSaved() {
  // composable already refetches admin list
}

onMounted(() => fetchAdminModules());
</script>
