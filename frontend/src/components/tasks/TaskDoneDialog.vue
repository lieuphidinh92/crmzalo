<template>
  <v-dialog v-model="open" max-width="540" persistent>
    <v-card v-if="task">
      <v-card-title class="d-flex align-center">
        <span style="font-size: 22px;">{{ task.category.icon }}</span>
        <span class="ml-2">Hoàn thành: {{ task.title }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="open = false" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <!-- Category-specific fields -->
        <template v-if="categoryKey === 'DAILY_POST'">
          <v-text-field
            v-model="postLink"
            label="Link bài đã đăng"
            placeholder="https://facebook.com/..."
            prepend-inner-icon="mdi-link-variant"
            density="comfortable"
          />
        </template>

        <template v-else-if="categoryKey === 'NEW_LEAD'">
          <v-select
            v-model="leadResult"
            :items="leadResultOptions"
            label="Kết quả liên hệ"
            density="comfortable"
            class="mb-2"
          />
        </template>

        <template v-else-if="categoryKey === 'WEEKLY_INTERACT'">
          <v-select
            v-model="interactType"
            :items="interactTypeOptions"
            label="Loại tương tác"
            density="comfortable"
            class="mb-2"
          />
        </template>

        <v-textarea
          v-model="completionNote"
          label="Ghi chú (tuỳ chọn)"
          rows="3"
          auto-grow
          density="comfortable"
        />
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Huỷ</v-btn>
        <v-btn
          color="success"
          :loading="saving"
          :disabled="!canSubmit"
          prepend-icon="mdi-check"
          @click="onSubmit"
        >
          Đã làm
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
  (
    e: 'submit',
    payload: { completionNote: string; metadataPatch: Record<string, unknown> },
  ): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const completionNote = ref('');
const postLink = ref('');
const leadResult = ref<string | null>(null);
const interactType = ref<string | null>(null);

const leadResultOptions = [
  { title: 'Đã rep — quan tâm', value: 'replied_interested' },
  { title: 'Đã rep — chưa quan tâm', value: 'replied_not_yet' },
  { title: 'Không rep', value: 'no_reply' },
  { title: 'Đã hẹn lại', value: 'rescheduled' },
];

const interactTypeOptions = [
  { title: 'Chào hàng', value: 'sales_pitch' },
  { title: 'Tài liệu MKT', value: 'mkt_doc' },
  { title: 'Thông tin hữu ích', value: 'useful_info' },
];

const categoryKey = computed(() => props.task?.category.key ?? '');

const canSubmit = computed(() => {
  if (categoryKey.value === 'DAILY_POST') return postLink.value.trim().length > 0;
  if (categoryKey.value === 'NEW_LEAD') return !!leadResult.value;
  if (categoryKey.value === 'WEEKLY_INTERACT') return !!interactType.value;
  return true;
});

watch(open, (v) => {
  if (!v) {
    completionNote.value = '';
    postLink.value = '';
    leadResult.value = null;
    interactType.value = null;
  }
});

function onSubmit() {
  const metadataPatch: Record<string, unknown> = {};
  if (categoryKey.value === 'DAILY_POST') metadataPatch.postLink = postLink.value.trim();
  if (categoryKey.value === 'NEW_LEAD') metadataPatch.leadResult = leadResult.value;
  if (categoryKey.value === 'WEEKLY_INTERACT') metadataPatch.interactType = interactType.value;
  emit('submit', { completionNote: completionNote.value.trim(), metadataPatch });
}
</script>
