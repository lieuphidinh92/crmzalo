/**
 * use-tasks — Việc cần làm state.
 */
import { reactive, ref } from 'vue';
import { api } from '@/api/index';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type TaskSource = 'auto' | 'recurring' | 'manual';
export type ListPeriod = 'today' | 'week' | 'month' | 'all';

export interface TaskCategory {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  sortOrder: number;
}

export interface TaskRow {
  id: string;
  orgId: string;
  categoryId: string;
  category: TaskCategory;
  assignedToId: string;
  contactId: string | null;
  contact: {
    id: string;
    fullName: string | null;
    phone: string | null;
    customerType: string | null;
    storeName: string | null;
    stage: string | null;
  } | null;
  title: string;
  description: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: number;
  status: TaskStatus;
  source: TaskSource;
  recurringRuleId: string | null;
  parentTaskId: string | null;
  createdAt: string;
  completedAt: string | null;
  completionNote: string | null;
  metadata: Record<string, unknown>;
}

export interface TaskStats {
  todayTotal: number;
  todayDone: number;
  overdue: number;
  weekTotal: number;
  weekDone: number;
  weekCompletionPercent: number;
}

export interface TaskFilters {
  period: ListPeriod;
  categoryIds: string[];
  statuses: TaskStatus[];
  sources: TaskSource[];
}

export function useTasks() {
  const filters = reactive<TaskFilters>({
    period: 'today',
    categoryIds: [],
    statuses: [],
    sources: [],
  });

  const tasks = ref<TaskRow[]>([]);
  const categories = ref<TaskCategory[]>([]);
  const stats = ref<TaskStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  function buildParams() {
    return {
      period: filters.period,
      category: filters.categoryIds.length ? filters.categoryIds.join(',') : undefined,
      status: filters.statuses.length ? filters.statuses.join(',') : undefined,
      source: filters.sources.length ? filters.sources.join(',') : undefined,
    };
  }

  async function fetchCategories() {
    if (categories.value.length) return categories.value;
    const res = await api.get('/task-categories');
    categories.value = res.data.categories ?? [];
    return categories.value;
  }

  async function fetchTasks() {
    loading.value = true;
    try {
      const res = await api.get('/tasks', { params: buildParams() });
      tasks.value = res.data.tasks ?? [];
      stats.value = res.data.stats ?? null;
      error.value = null;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Lỗi tải task';
    } finally {
      loading.value = false;
    }
  }

  async function refresh() {
    await Promise.all([fetchCategories(), fetchTasks()]);
  }

  async function markDone(taskId: string, completionNote?: string, metadataPatch?: Record<string, unknown>) {
    await api.put(`/tasks/${taskId}/done`, {
      completionNote: completionNote ?? null,
      metadataPatch,
    });
    await fetchTasks();
  }

  async function snoozeTask(taskId: string, newDue: string, newTime?: string | null) {
    await api.put(`/tasks/${taskId}/snooze`, { newDue, newTime: newTime ?? null });
    await fetchTasks();
  }

  async function skipTask(taskId: string, reason: string) {
    await api.put(`/tasks/${taskId}/skip`, { reason });
    await fetchTasks();
  }

  async function createManual(payload: {
    categoryId: string;
    title: string;
    dueDate: string;
    dueTime?: string;
    description?: string;
    priority?: number;
    contactId?: string;
  }) {
    await api.post('/tasks', payload);
    await fetchTasks();
  }

  async function fetchDetail(taskId: string) {
    const res = await api.get(`/tasks/${taskId}`);
    return res.data as TaskRow & {
      assignedTo: { id: string; fullName: string };
      recurringRule: { id: string; name: string } | null;
    };
  }

  return {
    filters,
    tasks,
    categories,
    stats,
    loading,
    error,
    fetchCategories,
    fetchTasks,
    refresh,
    markDone,
    snoozeTask,
    skipTask,
    createManual,
    fetchDetail,
  };
}

/* ── Helpers ──────────────────────────────────────────────────── */

export function categoryColorHex(token: string): string {
  const map: Record<string, string> = {
    red: '#EF4444',
    'red-darken-1': '#DC2626',
    blue: '#3B82F6',
    pink: '#EC4899',
    green: '#10B981',
    purple: '#8B5CF6',
    yellow: '#FBBF24',
    indigo: '#6366F1',
    orange: '#F59E0B',
    teal: '#14B8A6',
  };
  return map[token] ?? '#7A8AA0';
}

export function priorityLabel(p: number): { label: string; color: string } {
  if (p === 1) return { label: 'Cao', color: 'error' };
  if (p === 3) return { label: 'Thấp', color: 'grey' };
  return { label: 'Trung', color: 'warning' };
}

export function sourceMeta(s: TaskSource): { label: string; icon: string } {
  if (s === 'auto') return { label: 'Auto', icon: '🤖' };
  if (s === 'recurring') return { label: 'Định kỳ', icon: '🔄' };
  return { label: 'Thủ công', icon: '👤' };
}
