<template>
  <v-dialog v-model="open" max-width="540" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-plus-box-outline" class="mr-2" />
        Thêm task thủ công
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="open = false" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-row dense>
          <v-col cols="12">
            <v-select
              v-model="form.categoryId"
              :items="categoryOptions"
              item-title="label"
              item-value="id"
              label="Phân loại"
              density="comfortable"
              required
            />
          </v-col>
          <v-col cols="12">
            <v-text-field
              v-model="form.title"
              label="Tiêu đề"
              density="comfortable"
              required
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.dueDate"
              type="date"
              label="Hạn (ngày)"
              density="comfortable"
              :min="today"
              required
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.dueTime"
              type="time"
              label="Giờ (tuỳ chọn)"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12">
            <v-select
              v-model="form.priority"
              :items="priorityOptions"
              label="Ưu tiên"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12">
            <v-textarea
              v-model="form.description"
              label="Mô tả (tuỳ chọn)"
              rows="2"
              auto-grow
              density="comfortable"
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Huỷ</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!canSubmit"
          prepend-icon="mdi-content-save"
          @click="emit('submit', { ...form })"
        >
          Tạo task
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { TaskCategory } from '@/composables/use-tasks';

interface Props {
  modelValue: boolean;
  categories: TaskCategory[];
  saving: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (
    e: 'submit',
    payload: {
      categoryId: string;
      title: string;
      dueDate: string;
      dueTime: string;
      priority: number;
      description: string;
    },
  ): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const today = new Date().toISOString().slice(0, 10);

const form = reactive({
  categoryId: '',
  title: '',
  dueDate: today,
  dueTime: '',
  priority: 2,
  description: '',
});

const categoryOptions = computed(() =>
  props.categories.map((c) => ({ id: c.id, label: `${c.icon} ${c.name}` })),
);

const priorityOptions = [
  { title: 'Cao', value: 1 },
  { title: 'Trung bình', value: 2 },
  { title: 'Thấp', value: 3 },
];

const canSubmit = computed(
  () => !!form.categoryId && !!form.title.trim() && !!form.dueDate,
);

watch(open, (v) => {
  if (!v) {
    form.categoryId = '';
    form.title = '';
    form.dueDate = today;
    form.dueTime = '';
    form.priority = 2;
    form.description = '';
  }
});
</script>
