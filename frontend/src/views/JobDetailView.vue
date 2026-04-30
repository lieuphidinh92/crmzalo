<template>
  <div>
    <!-- Back + Title -->
    <div class="d-flex align-center mb-4 gap-2">
      <v-btn icon="mdi-arrow-left" variant="text" @click="router.push('/jobs')" />
      <h1 class="text-h5">{{ job?.name ?? 'Chi tiết công việc' }}</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-play" :loading="triggering" @click="onTrigger">
        Chạy ngay
      </v-btn>
    </div>

    <!-- Job info card -->
    <v-card v-if="job" class="mb-4" variant="outlined">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="3">
            <div class="text-caption text-grey">Loại</div>
            <v-chip :color="jobTypeColor(job.jobType)" size="small" variant="tonal" class="mt-1">
              {{ jobTypeLabel(job.jobType) }}
            </v-chip>
          </v-col>
          <v-col cols="12" sm="3">
            <div class="text-caption text-grey">Lịch chạy</div>
            <code class="text-body-2">{{ job.schedule || 'Thủ công' }}</code>
          </v-col>
          <v-col cols="12" sm="3">
            <div class="text-caption text-grey">Trạng thái</div>
            <v-chip :color="job.isActive ? 'success' : 'grey'" size="small" variant="tonal" class="mt-1">
              {{ job.isActive ? 'Hoạt động' : 'Tạm dừng' }}
            </v-chip>
          </v-col>
          <v-col cols="12" sm="3">
            <div class="text-caption text-grey">Lần chạy cuối</div>
            <div class="text-body-2">{{ job.lastRunAt ? formatDateTime(job.lastRunAt) : '—' }}</div>
          </v-col>
          <v-col v-if="job.rulesContent" cols="12">
            <div class="text-caption text-grey mb-1">Quy tắc AI</div>
            <v-sheet rounded="sm" class="pa-2 text-body-2" style="white-space: pre-wrap; font-family: monospace; max-height: 120px; overflow-y: auto;">{{ job.rulesContent }}</v-sheet>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Run history -->
    <h2 class="text-subtitle-1 font-weight-bold mb-2">Lịch sử chạy</h2>
    <v-data-table
      :headers="runHeaders"
      :items="runs"
      :loading="runsLoading"
      item-value="id"
      hover
      @click:row="onRunClick"
    >
      <template #item.startedAt="{ item }">
        {{ item.startedAt ? formatDateTime(item.startedAt) : '—' }}
      </template>
      <template #item.status="{ item }">
        <v-chip :color="runStatusColor(item.status)" size="small" variant="tonal">
          {{ runStatusLabel(item.status) }}
        </v-chip>
      </template>
      <template #item.resultCount="{ item }">
        {{ item.resultCount ?? 0 }} hội thoại
      </template>
      <template #item.error="{ item }">
        <span class="text-caption text-error">{{ item.error ?? '' }}</span>
      </template>
    </v-data-table>

    <!-- Run results drawer -->
    <v-dialog v-model="showResults" max-width="860" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center">
          Kết quả chạy
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="showResults = false" />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <v-data-table :headers="resultHeaders" :items="results" :loading="resultsLoading" item-value="id">
            <template #item.conversation="{ item }">
              <span class="text-body-2">{{ item.conversation?.contactName ?? item.conversationId }}</span>
            </template>
            <template #item.verdict="{ item }">
              <span class="text-body-2">{{ item.verdict ?? '—' }}</span>
            </template>
            <template #item.score="{ item }">
              <span class="text-body-2">{{ item.score != null ? item.score : '—' }}</span>
            </template>
            <template #item.comment="{ item }">
              <span class="text-body-2 text-truncate" style="max-width: 200px; display: inline-block;">{{ item.comment ?? '—' }}</span>
            </template>
            <template #item.details="{ item }">
              <v-btn v-if="item.details" size="x-small" variant="text" @click="viewDetails(item.details)">
                Xem
              </v-btn>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Details JSON dialog -->
    <v-dialog v-model="showDetailsJson" max-width="600">
      <v-card>
        <v-card-title class="d-flex align-center">
          Chi tiết
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="showDetailsJson = false" />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <pre class="text-body-2" style="white-space: pre-wrap; word-break: break-word;">{{ selectedDetails }}</pre>
        </v-card-text>
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
import { useRoute, useRouter } from 'vue-router';
import { useJobs, jobTypeLabel, jobTypeColor, runStatusColor, runStatusLabel } from '@/composables/use-jobs';
import type { Job, JobRun } from '@/composables/use-jobs';

const route = useRoute();
const router = useRouter();
const { jobs, loading: _loading, triggering, fetchJobs, triggerJob, fetchRuns, fetchResults } = useJobs();

const jobId = route.params.id as string;
const job = ref<Job | null>(null);
const runs = ref<JobRun[]>([]);
const results = ref<ReturnType<typeof fetchResults> extends Promise<infer T> ? T : never>([]);
const runsLoading = ref(false);
const resultsLoading = ref(false);
const showResults = ref(false);
const showDetailsJson = ref(false);
const selectedDetails = ref('');
const snackbar = ref({ show: false, text: '', color: 'success' });

const runHeaders = [
  { title: 'Thời gian', key: 'startedAt', sortable: true },
  { title: 'Trạng thái', key: 'status', sortable: false },
  { title: 'Kết quả', key: 'resultCount', sortable: false },
  { title: 'Lỗi', key: 'error', sortable: false },
];

const resultHeaders = [
  { title: 'Hội thoại', key: 'conversation', sortable: false },
  { title: 'Kết quả', key: 'verdict', sortable: false },
  { title: 'Điểm', key: 'score', sortable: false },
  { title: 'Nhận xét', key: 'comment', sortable: false },
  { title: 'Chi tiết', key: 'details', sortable: false, width: '80px' },
];

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('vi-VN');
}

async function onTrigger() {
  const runId = await triggerJob(jobId);
  if (runId) {
    snackbar.value = { show: true, text: 'Đã kích hoạt — tải lại lịch sử sau vài giây', color: 'info' };
    setTimeout(() => loadRuns(), 3000);
  } else {
    snackbar.value = { show: true, text: 'Kích hoạt thất bại', color: 'error' };
  }
}

async function onRunClick(_event: unknown, { item }: { item: JobRun }) {
  resultsLoading.value = true;
  showResults.value = true;
  results.value = await fetchResults(jobId, item.id) as never[];
  resultsLoading.value = false;
}

function viewDetails(details: Record<string, unknown>) {
  selectedDetails.value = JSON.stringify(details, null, 2);
  showDetailsJson.value = true;
}

async function loadRuns() {
  runsLoading.value = true;
  runs.value = await fetchRuns(jobId);
  runsLoading.value = false;
}

onMounted(async () => {
  await fetchJobs();
  job.value = jobs.value.find(j => j.id === jobId) ?? null;
  await loadRuns();
});
</script>
