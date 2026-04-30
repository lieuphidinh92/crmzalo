<template>
  <v-dialog v-model="open" max-width="420" persistent>
    <v-card v-if="task">
      <v-card-title>Bỏ qua: {{ task.title }}</v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-textarea
          v-model="reason"
          label="Lý do bỏ qua"
          rows="3"
          auto-grow
          density="comfortable"
          :rules="[(v: string) => !!v?.trim() || 'Cần lý do']"
        />
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Huỷ</v-btn>
        <v-btn
          color="error"
          :loading="saving"
          :disabled="!reason.trim()"
          @click="emit('submit', reason.trim())"
        >
          Bỏ qua
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
  (e: 'submit', reason: string): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});
const reason = ref('');
watch(open, (v) => {
  if (!v) reason.value = '';
});
</script>
