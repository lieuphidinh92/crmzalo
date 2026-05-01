<template>
  <div>
    <v-data-table
      :headers="headers"
      :items="recurringRules"
      :loading="loading"
      density="comfortable"
      class="nds-table"
      no-data-text="Chưa có quy tắc định kỳ nào"
    >
      <template #item.category="{ item }">
        <span>{{ item.category.icon }} {{ item.category.name }}</span>
      </template>
      <template #item.cronExpression="{ item }">
        <code>{{ item.cronExpression }}</code>
        <span class="text-caption text-medium-emphasis ml-2">
          {{ describeCron(item.cronExpression) }}
        </span>
      </template>
      <template #item.appliesToRole="{ item }">
        <v-chip size="x-small" variant="tonal">
          {{ item.appliesToRole === 'all' ? 'Tất cả' : 'Sale' }}
        </v-chip>
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
        <v-btn
          icon
          variant="text"
          size="small"
          @click="$emit('edit', item)"
        >
          <v-icon size="20">mdi-pencil</v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </div>
</template>

<script setup lang="ts">
import { useCadenceRules, type RecurringRule } from '@/composables/use-cadence-rules';

defineEmits<{ (e: 'edit', rule: RecurringRule): void }>();

const { recurringRules, loading } = useCadenceRules();

const headers = [
  { title: 'Tên rule', key: 'name', sortable: true },
  { title: 'Category', key: 'category', sortable: false },
  { title: 'Cron', key: 'cronExpression', sortable: false },
  { title: 'SL', key: 'defaultQuantity', sortable: true, align: 'end' as const },
  { title: 'Cho ai', key: 'appliesToRole', sortable: false, align: 'center' as const },
  { title: 'Trạng thái', key: 'active', sortable: false, align: 'center' as const },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

const dows = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return '';
  const [m, h, , , dow] = parts;
  const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  if (dow === '*') return `Hàng ngày ${time}`;
  const days = dow
    .split(',')
    .map((d) => dows[parseInt(d, 10) % 7])
    .join('/');
  return `${days} ${time}`;
}
</script>

<style scoped>
.nds-table :deep(code) {
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8em;
}
</style>
