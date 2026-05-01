/**
 * use-learning — Học tập module state for the user-facing page and the
 * admin management tab. Single shared module-level state so the stats
 * widget and the grid stay in sync after a complete/track action.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export type ModuleType = 'required' | 'optional';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';
export type FilterTab = 'required' | 'optional' | 'completed';

export interface LearningModule {
  id: string;
  name: string;
  description: string | null;
  type: ModuleType;
  contentUrl: string | null;
  durationMinutes: number;
  forRoles: string[];
  sortOrder: number;
  active: boolean;
  progressStatus: ProgressStatus;
  progressScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  learnerCount: number;
}

export interface LearningStats {
  requiredTotal: number;
  requiredCompleted: number;
  monthlyCompleted: number;
  monthlyTarget: number;
  monthlyPercent: number;
}

export interface AdminModule extends Omit<LearningModule, 'progressStatus' | 'progressScore' | 'startedAt' | 'completedAt' | 'learnerCount'> {
  completedCount: number;
  inProgressCount: number;
}

export interface TeamProgressRow {
  userId: string;
  fullName: string;
  role: string;
  requiredTotal: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  percent: number;
}

const modules = ref<LearningModule[]>([]);
const stats = ref<LearningStats | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function fetchModules(tab: FilterTab) {
  loading.value = true;
  try {
    const res = await api.get<{ modules: LearningModule[] }>(
      `/learning/modules?type=${tab}`,
    );
    modules.value = res.data.modules;
    error.value = null;
  } catch (err: any) {
    error.value = err?.response?.data?.error ?? 'Lỗi tải module';
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  try {
    const res = await api.get<{ stats: LearningStats }>('/learning/stats');
    stats.value = res.data.stats;
  } catch {
    // non-critical
  }
}

async function trackProgress(moduleId: string) {
  try {
    await api.post('/learning/track-progress', { moduleId });
  } catch {
    // heartbeat — silent failure is fine
  }
}

async function completeModule(moduleId: string, score: number | null) {
  await api.post('/learning/complete', { moduleId, score });
  await Promise.all([fetchStats()]);
}

export function useLearning() {
  return {
    modules,
    stats,
    loading,
    error,
    fetchModules,
    fetchStats,
    trackProgress,
    completeModule,
  };
}

/* ── Admin namespace ───────────────────────────────────────────────── */

const adminModules = ref<AdminModule[]>([]);
const teamProgress = ref<TeamProgressRow[]>([]);
const adminLoading = ref(false);

async function fetchAdminModules() {
  adminLoading.value = true;
  try {
    const res = await api.get<{ modules: AdminModule[] }>(
      '/learning/admin/modules',
    );
    adminModules.value = res.data.modules;
  } finally {
    adminLoading.value = false;
  }
}

async function fetchTeamProgress() {
  const res = await api.get<{ rows: TeamProgressRow[] }>(
    '/learning/admin/team-progress',
  );
  teamProgress.value = res.data.rows;
}

export interface ModuleInput {
  name: string;
  description?: string | null;
  type?: ModuleType;
  contentUrl?: string | null;
  durationMinutes?: number;
  forRoles?: string[];
  sortOrder?: number;
  active?: boolean;
}

async function createAdminModule(input: ModuleInput) {
  await api.post('/learning/admin/modules', input);
  await fetchAdminModules();
}

async function updateAdminModule(id: string, input: ModuleInput) {
  await api.put(`/learning/admin/modules/${id}`, input);
  await fetchAdminModules();
}

async function deleteAdminModule(id: string) {
  await api.delete(`/learning/admin/modules/${id}`);
  await fetchAdminModules();
}

export function useLearningAdmin() {
  return {
    adminModules,
    teamProgress,
    adminLoading,
    fetchAdminModules,
    fetchTeamProgress,
    createAdminModule,
    updateAdminModule,
    deleteAdminModule,
  };
}
