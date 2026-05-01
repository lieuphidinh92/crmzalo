<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
    max-width="600"
    persistent
  >
    <v-card v-if="rule">
      <v-card-title>Sửa quy tắc tự động</v-card-title>
      <v-card-text>
        <p class="text-caption text-medium-emphasis mb-3">
          Trigger:
          <code>{{ rule.triggerType }}</code>
          → tạo task category
          <strong>{{ rule.category.icon }} {{ rule.category.name }}</strong>
        </p>

        <v-text-field
          v-if="hasDaysCondition"
          v-model.number="daysThreshold"
          :label="daysLabel"
          type="number"
          min="1"
          variant="outlined"
          density="compact"
        />

        <v-text-field
          v-model.number="form.dueInHours"
          label="Due in (giờ) sau khi trigger"
          type="number"
          min="1"
          variant="outlined"
          density="compact"
        />

        <v-textarea
          v-model="form.messageTemplate"
          label="Message template"
          hint="Hỗ trợ biến: {{contactName}}, {{customerType}}, {{daysSinceLastOrder}}, ..."
          persistent-hint
          variant="outlined"
          density="compact"
          rows="3"
          auto-grow
        />

        <v-switch
          v-model="form.active"
          color="success"
          :label="form.active ? 'Đang bật' : 'Đang tắt'"
          density="compact"
          hide-details
          class="mt-3"
        />
      </v-card-text>

      <v-card-actions>
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
import { computed, reactive, ref, watch } from 'vue';
import { useCadenceRules, type AutoRule } from '@/composables/use-cadence-rules';

const props = defineProps<{ modelValue: boolean; rule: AutoRule | null }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const { updateAutoRule } = useCadenceRules();

const form = reactive({
  dueInHours: 24,
  messageTemplate: '',
  active: true,
});
const daysThreshold = ref<number>(0);
const saving = ref(false);

// Trigger types that include a days threshold in their condition
const DAYS_KEY_BY_TRIGGER: Record<string, string> = {
  inactive_chat: 'daysSinceLastMessage',
  inactive_order: 'daysSinceLastOrder',
  upsell_eligible: 'activeAndDaysSinceLastUpsell',
};

const hasDaysCondition = computed(() => {
  if (!props.rule) return false;
  return props.rule.triggerType in DAYS_KEY_BY_TRIGGER;
});

const daysLabel = computed(() => {
  if (!props.rule) return '';
  const t = props.rule.triggerType;
  if (t === 'inactive_chat') return 'Số ngày không chat';
  if (t === 'inactive_order') return 'Số ngày không đặt hàng';
  if (t === 'upsell_eligible') return 'Số ngày active không upsell';
  return 'Ngưỡng ngày';
});

watch(
  () => props.rule,
  (rule) => {
    if (!rule) return;
    form.dueInHours = rule.dueInHours;
    form.messageTemplate = rule.messageTemplate;
    form.active = rule.active;
    const key = DAYS_KEY_BY_TRIGGER[rule.triggerType];
    if (key) {
      const cond = rule.triggerCondition as Record<string, unknown>;
      const v = Number(cond?.[key]);
      daysThreshold.value = Number.isFinite(v) ? v : 0;
    } else {
      daysThreshold.value = 0;
    }
  },
  { immediate: true },
);

async function onSave() {
  if (!props.rule) return;
  saving.value = true;
  try {
    const condition = { ...(props.rule.triggerCondition as Record<string, unknown>) };
    const key = DAYS_KEY_BY_TRIGGER[props.rule.triggerType];
    if (key && daysThreshold.value > 0) {
      condition[key] = daysThreshold.value;
    }
    await updateAutoRule(props.rule.id, {
      dueInHours: form.dueInHours,
      messageTemplate: form.messageTemplate,
      active: form.active,
      triggerCondition: condition,
    });
    emit('saved');
    emit('update:modelValue', false);
  } finally {
    saving.value = false;
  }
}
</script>
