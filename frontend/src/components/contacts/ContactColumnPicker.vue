<template>
  <v-menu :close-on-content-click="false" location="bottom end">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        prepend-icon="mdi-cog-outline"
        variant="tonal"
        size="small"
      >
        Cột hiển thị
      </v-btn>
    </template>

    <v-card min-width="240" class="pa-1">
      <v-list density="compact">
        <v-list-subheader class="text-caption text-medium-emphasis">
          Chọn cột hiển thị
        </v-list-subheader>
        <v-list-item
          v-for="col in columns"
          :key="col.key"
          @click="toggle(col.key)"
        >
          <template #prepend>
            <v-checkbox-btn
              :model-value="isVisible(col.key)"
              :disabled="col.alwaysVisible"
              color="primary"
              density="compact"
            />
          </template>
          <v-list-item-title :class="{ 'text-disabled': col.alwaysVisible }">
            {{ col.title }}
            <span v-if="col.alwaysVisible" class="text-caption ml-1">
              (luôn hiện)
            </span>
          </v-list-item-title>
        </v-list-item>
      </v-list>

      <v-divider />
      <div class="d-flex pa-2">
        <v-btn size="small" variant="text" @click="resetToDefault">Mặc định</v-btn>
        <v-spacer />
        <v-btn size="small" variant="text" @click="showAll">Hiện hết</v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
export interface ColumnDef {
  key: string;
  title: string;
  alwaysVisible?: boolean;
  defaultVisible?: boolean;
}

interface Props {
  columns: ColumnDef[];
  /** Visible column keys (v-model). */
  modelValue: string[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>();

function isVisible(key: string): boolean {
  return props.modelValue.includes(key);
}

function toggle(key: string) {
  const col = props.columns.find((c) => c.key === key);
  if (col?.alwaysVisible) return;
  const next = isVisible(key)
    ? props.modelValue.filter((k) => k !== key)
    : [...props.modelValue, key];
  emit('update:modelValue', next);
}

function resetToDefault() {
  const next = props.columns
    .filter((c) => c.alwaysVisible || c.defaultVisible)
    .map((c) => c.key);
  emit('update:modelValue', next);
}

function showAll() {
  emit(
    'update:modelValue',
    props.columns.map((c) => c.key),
  );
}
</script>
