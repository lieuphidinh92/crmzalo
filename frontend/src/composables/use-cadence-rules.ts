/**
 * use-cadence-rules — admin state for RecurringTaskRule + AutoTaskRule.
 *
 * Lists, updates, validates cron expressions, and triggers test runs of
 * a recurring rule.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface RuleCategory {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
}

export interface RecurringRule {
  id: string;
  name: string;
  description: string | null;
  cronExpression: string;
  appliesToRole: string;
  defaultQuantity: number;
  active: boolean;
  categoryId: string;
  category: RuleCategory;
}

export interface AutoRule {
  id: string;
  triggerType: string;
  triggerCondition: Record<string, unknown>;
  dueInHours: number;
  messageTemplate: string;
  active: boolean;
  categoryId: string;
  category: RuleCategory;
}

const recurringRules = ref<RecurringRule[]>([]);
const autoRules = ref<AutoRule[]>([]);
const loading = ref(false);

async function fetchRecurringRules() {
  loading.value = true;
  try {
    const res = await api.get<{ rules: RecurringRule[] }>('/recurring-task-rules');
    recurringRules.value = res.data.rules;
  } finally {
    loading.value = false;
  }
}

async function fetchAutoRules() {
  loading.value = true;
  try {
    const res = await api.get<{ rules: AutoRule[] }>('/auto-task-rules');
    autoRules.value = res.data.rules;
  } finally {
    loading.value = false;
  }
}

export interface RecurringRulePatch {
  name?: string;
  description?: string;
  cronExpression?: string;
  appliesToRole?: string;
  defaultQuantity?: number;
  active?: boolean;
}

async function updateRecurringRule(id: string, patch: RecurringRulePatch) {
  await api.put(`/recurring-task-rules/${id}`, patch);
  await fetchRecurringRules();
}

export interface AutoRulePatch {
  triggerCondition?: Record<string, unknown>;
  dueInHours?: number;
  messageTemplate?: string;
  active?: boolean;
}

async function updateAutoRule(id: string, patch: AutoRulePatch) {
  await api.put(`/auto-task-rules/${id}`, patch);
  await fetchAutoRules();
}

export interface CronValidationResult {
  valid: boolean;
  error?: string;
  nextRuns?: string[];
}

async function validateCron(expression: string): Promise<CronValidationResult> {
  try {
    const res = await api.post<{ valid: true; nextRuns: string[] }>(
      '/cadence/validate-cron',
      { expression },
    );
    return { valid: true, nextRuns: res.data.nextRuns };
  } catch (err: any) {
    return {
      valid: false,
      error: err?.response?.data?.error ?? 'Cron expression không hợp lệ',
    };
  }
}

async function testRecurringRule(id: string) {
  const res = await api.post<{ task: { id: string; title: string } }>(
    `/cadence/recurring-rules/${id}/test`,
  );
  return res.data.task;
}

export function useCadenceRules() {
  return {
    recurringRules,
    autoRules,
    loading,
    fetchRecurringRules,
    fetchAutoRules,
    updateRecurringRule,
    updateAutoRule,
    validateCron,
    testRecurringRule,
  };
}
