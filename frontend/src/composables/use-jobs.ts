/**
 * Composable for AI jobs (công việc AI) management:
 * - CRUD for jobs (qc / classify)
 * - Trigger job runs
 * - Fetch run history and run results
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface Job {
  id: string;
  name: string;
  jobType: 'qc' | 'classify';
  schedule: string | null;
  config: Record<string, unknown>;
  rulesContent: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  resultCount: number;
  error: string | null;
}

export interface JobResult {
  id: string;
  runId: string;
  conversationId: string;
  conversation?: { id: string; contactName?: string };
  jobType: string;
  verdict: string | null;
  score: number | null;
  comment: string | null;
  details: Record<string, unknown> | null;
}

export interface CreateJobPayload {
  name: string;
  jobType: 'qc' | 'classify';
  schedule: string;
  rulesContent: string;
  config: { maxConversations: number };
}

export const JOB_TYPE_OPTIONS = [
  { title: 'Đánh giá QC', value: 'qc' },
  { title: 'Phân loại', value: 'classify' },
];

export function jobTypeLabel(type: string): string {
  return JOB_TYPE_OPTIONS.find(o => o.value === type)?.title ?? type;
}

export function jobTypeColor(type: string): string {
  return type === 'qc' ? 'primary' : 'info';
}

export function runStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'success';
    case 'running': return 'blue';
    case 'failed': return 'error';
    default: return 'grey';
  }
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case 'completed': return 'Hoàn thành';
    case 'running': return 'Đang chạy';
    case 'failed': return 'Lỗi';
    case 'pending': return 'Chờ';
    default: return status;
  }
}

export function useJobs() {
  const jobs = ref<Job[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const triggering = ref(false);

  async function fetchJobs() {
    loading.value = true;
    try {
      const res = await api.get('/jobs');
      jobs.value = res.data.jobs ?? res.data;
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      loading.value = false;
    }
  }

  async function createJob(payload: CreateJobPayload): Promise<Job | null> {
    saving.value = true;
    try {
      const res = await api.post('/jobs', payload);
      return res.data;
    } catch (err) {
      console.error('Failed to create job:', err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateJob(id: string, payload: Partial<Job>): Promise<boolean> {
    saving.value = true;
    try {
      await api.put(`/jobs/${id}`, payload);
      const idx = jobs.value.findIndex(j => j.id === id);
      if (idx !== -1) jobs.value[idx] = { ...jobs.value[idx], ...payload };
      return true;
    } catch (err) {
      console.error('Failed to update job:', err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function deleteJob(id: string): Promise<boolean> {
    try {
      await api.delete(`/jobs/${id}`);
      jobs.value = jobs.value.filter(j => j.id !== id);
      return true;
    } catch (err) {
      console.error('Failed to delete job:', err);
      return false;
    }
  }

  async function triggerJob(id: string): Promise<string | null> {
    triggering.value = true;
    try {
      const res = await api.post(`/jobs/${id}/trigger`);
      return res.data.runId ?? null;
    } catch (err) {
      console.error('Failed to trigger job:', err);
      return null;
    } finally {
      triggering.value = false;
    }
  }

  async function fetchRuns(jobId: string): Promise<JobRun[]> {
    try {
      const res = await api.get(`/jobs/${jobId}/runs`);
      return res.data.runs ?? res.data;
    } catch (err) {
      console.error('Failed to fetch runs:', err);
      return [];
    }
  }

  async function fetchResults(jobId: string, runId: string): Promise<JobResult[]> {
    try {
      const res = await api.get(`/jobs/${jobId}/runs/${runId}/results`);
      return res.data.results ?? res.data;
    } catch (err) {
      console.error('Failed to fetch results:', err);
      return [];
    }
  }

  return {
    jobs, loading, saving, triggering,
    fetchJobs, createJob, updateJob, deleteJob,
    triggerJob, fetchRuns, fetchResults,
  };
}
