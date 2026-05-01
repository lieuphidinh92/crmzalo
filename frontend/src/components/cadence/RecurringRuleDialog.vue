<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
    max-width="640"
    persistent
  >
    <v-card v-if="rule">
      <v-card-title>Sửa quy tắc định kỳ</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="form.name"
          label="Tên rule"
          variant="outlined"
          density="compact"
        />
        <v-textarea
          v-model="form.description"
          label="Mô tả"
          variant="outlined"
          density="compact"
          rows="2"
          auto-grow
        />

        <div class="d-flex align-center" style="gap: 12px;">
          <v-select
            v-model="cronPreset"
            :items="cronPresets"
            label="Lịch chạy (preset)"
            variant="outlined"
            density="compact"
            class="flex-1"
            @update:model-value="onPresetChange"
          />
        </div>

        <v-text-field
          v-model="form.cronExpression"
          label="Cron expression"
          hint="Format: M H DOM MON DOW (vd: 0 8 * * 1 = Thứ 2 8h)"
          persistent-hint
          variant="outlined"
          density="compact"
          :error-messages="cronError ? [cronError] : []"
          @blur="checkCron"
        />
        <div v-if="nextRuns.length" class="text-caption text-medium-emphasis mt-1 mb-3">
          🕐 Lần chạy tiếp theo:
          <span v-for="(t, i) in nextRuns" :key="i" class="mr-2">{{ formatTime(t) }}</span>
        </div>

        <div class="d-flex" style="gap: 12px;">
          <v-text-field
            v-model.number="form.defaultQuantity"
            label="Số lượng task / lần"
            type="number"
            min="1"
            variant="outlined"
            density="compact"
            class="flex-1"
          />
          <v-select
            v-model="form.appliesToRole"
            :items="roleOptions"
            label="Áp dụng cho"
            variant="outlined"
            density="compact"
            class="flex-1"
          />
        </div>

        <v-switch
          v-model="form.active"
          color="success"
          :label="form.active ? 'Đang bật' : 'Đang tắt'"
          density="compact"
          hide-details
        />
      </v-card-text>

      <v-card-actions>
        <v-btn variant="text" prepend-icon="mdi-flask" @click="onTest">
          🧪 Test rule
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Huỷ</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" @click="onSave">
          Lưu
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import {
  useCadenceRules,
  type RecurringRule,
} from '@/composables/use-cadence-rules';

const props = defineProps<{ modelValue: boolean; rule: RecurringRule | null }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
  (e: 'tested', taskId: string): void;
}>();

const { updateRecurringRule, validateCron, testRecurringRule } = useCadenceRules();

const cronPresets = [
  { title: 'Hàng ngày 8h', value: '0 8 * * *' },
  { title: 'Hàng ngày 17h', value: '0 17 * * *' },
  { title: 'Hàng ngày 17:30', value: '30 17 * * *' },
  { title: 'Thứ 2 9h', value: '0 9 * * 1' },
  { title: 'Thứ 4 9h', value: '0 9 * * 3' },
  { title: 'Thứ 6 9h', value: '0 9 * * 5' },
  { title: 'Thứ 6 16h', value: '0 16 * * 5' },
  { title: 'Chủ Nhật 20h', value: '0 20 * * 0' },
  { title: 'Custom...', value: 'custom' },
];

const roleOptions = [
  { title: 'Tất cả', value: 'all' },
  { title: 'Sale (member)', value: 'sale' },
];

const form = reactive({
  name: '',
  description: '',
  cronExpression: '',
  appliesToRole: 'all',
  defaultQuantity: 1,
  active: true,
});

const cronPreset = ref<string>('custom');
const cronError = ref<string | null>(null);
const nextRuns = ref<string[]>([]);
const saving = ref(false);

watch(
  () => props.rule,
  (rule) => {
    if (!rule) return;
    form.name = rule.name;
    form.description = rule.description ?? '';
    form.cronExpression = rule.cronExpression;
    form.appliesToRole = rule.appliesToRole;
    form.defaultQuantity = rule.defaultQuantity;
    form.active = rule.active;
    cronError.value = null;
    nextRuns.value = [];
    const matched = cronPresets.find((p) => p.value === rule.cronExpression);
    cronPreset.value = matched ? matched.value : 'custom';
    if (matched) checkCron();
  },
  { immediate: true },
);

function onPresetChange(val: string) {
  if (val !== 'custom') {
    form.cronExpression = val;
    checkCron();
  }
}

async function checkCron() {
  if (!form.cronExpression) return;
  const res = await validateCron(form.cronExpression);
  if (res.valid) {
    cronError.value = null;
    nextRuns.value = res.nextRuns ?? [];
  } else {
    cronError.value = res.error ?? 'Cron expression không hợp lệ';
    nextRuns.value = [];
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

async function onSave() {
  if (!props.rule) return;
  await checkCron();
  if (cronError.value) return;
  saving.value = true;
  try {
    await updateRecurringRule(props.rule.id, {
      name: form.name,
      description: form.description,
      cronExpression: form.cronExpression,
      appliesToRole: form.appliesToRole,
      defaultQuantity: form.defaultQuantity,
      active: form.active,
    });
    emit('saved');
    emit('update:modelValue', false);
  } finally {
    saving.value = false;
  }
}

async function onTest() {
  if (!props.rule) return;
  const task = await testRecurringRule(props.rule.id);
  emit('tested', task.id);
}
</script>
