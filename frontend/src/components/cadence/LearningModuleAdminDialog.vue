<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title>{{ isEdit ? 'Sửa module' : 'Thêm module' }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="form.name"
          label="Tên module"
          variant="outlined"
          density="compact"
          required
        />
        <v-textarea
          v-model="form.description"
          label="Mô tả ngắn"
          variant="outlined"
          density="compact"
          rows="2"
          auto-grow
        />
        <div class="d-flex" style="gap: 12px;">
          <v-select
            v-model="form.type"
            :items="typeOptions"
            label="Loại"
            variant="outlined"
            density="compact"
            class="flex-1"
          />
          <v-text-field
            v-model.number="form.durationMinutes"
            label="Thời lượng (phút)"
            type="number"
            min="0"
            variant="outlined"
            density="compact"
            class="flex-1"
          />
        </div>
        <v-text-field
          v-model="form.contentUrl"
          label="Content URL (YouTube / iframe / file)"
          variant="outlined"
          density="compact"
        />
        <v-select
          v-model="form.forRoles"
          :items="roleOptions"
          label="Áp dụng cho vai trò"
          variant="outlined"
          density="compact"
          multiple
          chips
          hint="Bỏ trống = áp dụng cho mọi vai trò"
          persistent-hint
        />
        <div class="d-flex align-center mt-3" style="gap: 16px;">
          <v-text-field
            v-model.number="form.sortOrder"
            label="Thứ tự"
            type="number"
            variant="outlined"
            density="compact"
            style="max-width: 120px;"
          />
          <v-switch
            v-model="form.active"
            color="success"
            :label="form.active ? 'Đang bật' : 'Đang tắt'"
            density="compact"
            hide-details
          />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn
          v-if="isEdit"
          color="error"
          variant="text"
          prepend-icon="mdi-delete-outline"
          @click="onDelete"
        >
          Xoá
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
import { computed, reactive, ref, watch } from 'vue';
import {
  useLearningAdmin,
  type AdminModule,
  type ModuleInput,
} from '@/composables/use-learning';

const props = defineProps<{
  modelValue: boolean;
  module: AdminModule | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const { createAdminModule, updateAdminModule, deleteAdminModule } = useLearningAdmin();

const typeOptions = [
  { title: 'Bắt buộc', value: 'required' },
  { title: 'Tự chọn', value: 'optional' },
];
const roleOptions = [
  { title: 'Sale (member)', value: 'member' },
  { title: 'Admin', value: 'admin' },
  { title: 'Owner', value: 'owner' },
];

const form = reactive<Required<Omit<ModuleInput, 'description' | 'contentUrl'>> & { description: string; contentUrl: string }>({
  name: '',
  description: '',
  type: 'optional',
  contentUrl: '',
  durationMinutes: 0,
  forRoles: [],
  sortOrder: 0,
  active: true,
});

const isEdit = computed(() => !!props.module);
const saving = ref(false);

watch(
  () => props.module,
  (mod) => {
    if (mod) {
      form.name = mod.name;
      form.description = mod.description ?? '';
      form.type = mod.type;
      form.contentUrl = mod.contentUrl ?? '';
      form.durationMinutes = mod.durationMinutes;
      form.forRoles = [...(mod.forRoles ?? [])];
      form.sortOrder = mod.sortOrder;
      form.active = mod.active;
    } else {
      form.name = '';
      form.description = '';
      form.type = 'optional';
      form.contentUrl = '';
      form.durationMinutes = 0;
      form.forRoles = [];
      form.sortOrder = 0;
      form.active = true;
    }
  },
  { immediate: true },
);

async function onSave() {
  if (!form.name.trim()) return;
  saving.value = true;
  try {
    const payload: ModuleInput = {
      name: form.name,
      description: form.description || null,
      type: form.type,
      contentUrl: form.contentUrl || null,
      durationMinutes: form.durationMinutes,
      forRoles: form.forRoles,
      sortOrder: form.sortOrder,
      active: form.active,
    };
    if (props.module) {
      await updateAdminModule(props.module.id, payload);
    } else {
      await createAdminModule(payload);
    }
    emit('saved');
    emit('update:modelValue', false);
  } finally {
    saving.value = false;
  }
}

async function onDelete() {
  if (!props.module) return;
  if (!confirm(`Tắt module "${props.module.name}"?`)) return;
  saving.value = true;
  try {
    await deleteAdminModule(props.module.id);
    emit('saved');
    emit('update:modelValue', false);
  } finally {
    saving.value = false;
  }
}
</script>
