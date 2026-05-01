<template>
  <v-data-table
    :headers="headers"
    :items="autoRules"
    :loading="loading"
    density="comfortable"
    no-data-text="Chưa có quy tắc tự động nào"
  >
    <template #item.category="{ item }">
      <span>{{ item.category.icon }} {{ item.category.name }}</span>
    </template>
    <template #item.triggerType="{ item }">
      <code>{{ item.triggerType }}</code>
    </template>
    <template #item.dueInHours="{ item }">
      {{ describeDue(item.dueInHours) }}
    </template>
    <template #item.active="{ item }">
      <v-chip
        size="x-small"
        :color="item.active ? 'success' : 'grey'"
        variant="tonal"
      >
        {{ item.active ? 'Bật' : 'Tắt' }}
      </v-chip>
    </template>
    <template #item.actions="{ item }">
      <v-btn icon variant="text" size="small" @click="$emit('edit', item)">
        <v-icon size="20">mdi-pencil</v-icon>
      </v-btn>
    </template>
  </v-data-table>
</template>

<script setup lang="ts">
import { useCadenceRules, type AutoRule } from '@/composables/use-cadence-rules';

defineEmits<{ (e: 'edit', rule: AutoRule): void }>();

const { autoRules, loading } = useCadenceRules();

const headers = [
  { title: 'Trigger type', key: 'triggerType', sortable: true },
  { title: 'Category', key: 'category', sortable: false },
  { title: 'Due in', key: 'dueInHours', sortable: true },
  { title: 'Trạng thái', key: 'active', sortable: false, align: 'center' as const },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

function describeDue(hours: number): string {
  if (hours < 24) return `${hours} giờ`;
  const d = Math.round(hours / 24);
  return `${d} ngày`;
}
</script>
