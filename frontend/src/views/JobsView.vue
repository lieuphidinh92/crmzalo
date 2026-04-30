<template>
  <div>
    <!-- Toolbar -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">Công việc AI</h1>
      <v-spacer />
      <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="showCreateDialog = true">
        Tạo công việc
      </v-btn>
    </div>

    <!-- Jobs table -->
    <v-data-table :headers="headers" :items="jobs" :loading="loading" item-value="id" hover @click:row="onRowClick">
      <template #item.jobType="{ item }">
        <v-chip :color="jobTypeColor(item.jobType)" size="small" variant="tonal">
          {{ jobTypeLabel(item.jobType) }}
        </v-chip>
      </template>

      <template #item.schedule="{ item }">
        <span class="text-mono text-caption">{{ item.schedule || '—' }}</span>
      </template>

      <template #item.isActive="{ item }">
        <v-chip :color="item.isActive ? 'success' : 'grey'" size="small" variant="tonal">
          {{ item.isActive ? 'Hoạt động' : 'Tạm dừng' }}
        </v-chip>
      </template>

      <template #item.lastRunAt="{ item }">
        {{ item.lastRunAt ? formatDateTime(item.lastRunAt) : '—' }}
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex gap-1" @click.stop>
          <v-btn
            size="small" variant="text" color="info"
            icon="mdi-play" title="Chạy ngay"
            :loading="triggering"
            @click="onTrigger(item.id)"
          />
          <v-btn
            v-if="authStore.isAdmin"
            size="small" variant="text" color="error"
            icon="mdi-delete" title="Xoá"
            @click="onDelete(item.id)"
          />
        </div>
      </template>
    </v-data-table>

    <!-- Create job dialog -->
    <v-dialog v-model="showCreateDialog" max-width="560" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          Tạo công việc AI
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeDialog" />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="form.name" label="Tên công việc" required />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.jobType"
                :items="JOB_TYPE_OPTIONS"
                item-title="title"
                item-value="value"
                label="Loại"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.schedule"
                label="Lịch chạy (cron)"
                placeholder="0 8 * * *"
                hint="Để trống nếu chạy thủ công"
                persistent-hint
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="form.maxConversations"
                label="Số hội thoại tối đa mỗi lần"
                type="number"
                min="1"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="form.rulesContent"
                label="Quy tắc AI (prompt)"
                rows="4"
                auto-grow
                hint="Hướng dẫn cho AI khi xử lý hội thoại"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeDialog">Huỷ</v-btn>
          <v-btn color="primary" :loading="saving" @click="onSave">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000" location="bottom right">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useJobs, JOB_TYPE_OPTIONS, jobTypeLabel, jobTypeColor } from '@/composables/use-jobs';
import type { Job } from '@/composables/use-jobs';

const authStore = useAuthStore();
const router = useRouter();
const { jobs, loading, saving, triggering, fetchJobs, createJob, deleteJob, triggerJob } = useJobs();

const showCreateDialog = ref(false);
const snackbar = ref({ show: false, text: '', color: 'success' });

const form = ref({ name: '', jobType: 'qc' as 'qc' | 'classify', schedule: '', rulesContent: '', maxConversations: 20 });

const headers = [
  { title: 'Tên', key: 'name', sortable: true },
  { title: 'Loại', key: 'jobType', sortable: false },
  { title: 'Lịch chạy', key: 'schedule', sortable: false },
  { title: 'Trạng thái', key: 'isActive', sortable: false },
  { title: 'Lần chạy cuối', key: 'lastRunAt', sortable: true },
  { title: '', key: 'actions', sortable: false, width: '100px' },
];

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('vi-VN');
}

function closeDialog() {
  showCreateDialog.value = false;
  form.value = { name: '', jobType: 'qc', schedule: '', rulesContent: '', maxConversations: 20 };
}

function onRowClick(_event: unknown, { item }: { item: Job }) {
  router.push(`/jobs/${item.id}`);
}

async function onTrigger(id: string) {
  const runId = await triggerJob(id);
  snackbar.value = runId
    ? { show: true, text: 'Đã kích hoạt công việc', color: 'success' }
    : { show: true, text: 'Kích hoạt thất bại', color: 'error' };
}

async function onDelete(id: string) {
  const ok = await deleteJob(id);
  if (ok) snackbar.value = { show: true, text: 'Đã xoá công việc', color: 'success' };
}

async function onSave() {
  if (!form.value.name) return;
  const result = await createJob({
    name: form.value.name,
    jobType: form.value.jobType,
    schedule: form.value.schedule,
    rulesContent: form.value.rulesContent,
    config: { maxConversations: form.value.maxConversations },
  });
  if (result) {
    closeDialog();
    await fetchJobs();
    snackbar.value = { show: true, text: 'Tạo công việc thành công', color: 'success' };
  }
}

onMounted(() => fetchJobs());
</script>
