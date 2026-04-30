<template>
  <v-dialog v-model="open" max-width="420" persistent>
    <v-card v-if="task">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-clock-edit-outline" class="mr-2" />
        Hoãn task: {{ task.title }}
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model="newDue"
              type="date"
              label="Ngày mới"
              density="comfortable"
              :min="today"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="newTime"
              type="time"
              label="Giờ (tuỳ chọn)"
              density="comfortable"
            />
          </v-col>
        </v-row>
        <div class="d-flex flex-wrap mt-2" style="gap: 4px;">
          <v-chip
            v-for="preset in presets"
            :key="preset.label"
            size="small"
            variant="tonal"
            @click="applyPreset(preset.days)"
          >{{ preset.label }}</v-chip>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Huỷ</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!newDue"
          prepend-icon="mdi-check"
          @click="onSubmit"
        >
          Hoãn
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TaskRow } from '@/composables/use-tasks';

interface Props {
  modelValue: boolean;
  task: TaskRow | null;
  saving: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: { newDue: string; newTime: string | null }): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const today = new Date().toISOString().slice(0, 10);
const newDue = ref(today);
const newTime = ref('');

const presets = [
  { label: '+1 ngày', days: 1 },
  { label: '+3 ngày', days: 3 },
  { label: '+1 tuần', days: 7 },
];

watch(
  () => props.task?.id,
  () => {
    newDue.value = today;
    newTime.value = props.task?.dueTime ?? '';
  },
);

function applyPreset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  newDue.value = d.toISOString().slice(0, 10);
}

function onSubmit() {
  emit('submit', {
    newDue: newDue.value,
    newTime: newTime.value || null,
  });
}
</script>
