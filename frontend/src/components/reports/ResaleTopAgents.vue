<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-trophy-outline" color="primary" class="mr-2" />
      <div class="text-h6">Top 10 đại lý đóng góp DS resale</div>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <v-table density="comfortable">
      <thead>
        <tr>
          <th>#</th>
          <th>Đại lý</th>
          <th>Loại</th>
          <th>Sale</th>
          <th class="text-right">Số đơn</th>
          <th class="text-right">Tổng DS</th>
          <th>Đơn cuối</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(agent, idx) in topAgents"
          :key="agent.contactId"
          class="cursor-pointer"
          @click="$emit('open-agent', agent.contactId)"
        >
          <td>
            <v-chip
              v-if="idx < 3"
              size="x-small"
              :color="['warning', 'grey', 'orange'][idx]"
              variant="flat"
            >{{ idx + 1 }}</v-chip>
            <span v-else class="text-medium-emphasis">{{ idx + 1 }}</span>
          </td>
          <td class="font-weight-medium">{{ agent.fullName || '(không tên)' }}</td>
          <td>
            <v-chip v-if="agent.customerType" size="x-small" variant="tonal" color="info">
              {{ customerTypeLabel(agent.customerType) }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </td>
          <td class="text-medium-emphasis">{{ agent.assignedUser?.fullName ?? '—' }}</td>
          <td class="text-right">{{ agent.orderCount }}</td>
          <td class="text-right font-weight-medium">{{ formatVND(agent.totalRevenue) }}</td>
          <td class="text-medium-emphasis">
            <span v-if="agent.daysSinceLastOrder == null">—</span>
            <span v-else-if="agent.daysSinceLastOrder <= 1">Hôm nay</span>
            <span v-else>{{ agent.daysSinceLastOrder }} ngày trước</span>
          </td>
        </tr>
        <tr v-if="!loading && topAgents.length === 0">
          <td colspan="7" class="text-center pa-6 text-medium-emphasis">
            <v-icon size="48" color="grey-darken-1">mdi-database-off-outline</v-icon>
            <div class="mt-2">Chưa có đơn nào trong khoảng thời gian này.</div>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<script setup lang="ts">
import { formatVND, type TopAgent } from '@/composables/use-resale-report';

interface Props {
  topAgents: TopAgent[];
  loading: boolean;
}

defineProps<Props>();
defineEmits<{ (e: 'open-agent', contactId: string): void }>();

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Mẹ bé',
};

function customerTypeLabel(t: string): string {
  return CUSTOMER_TYPE_LABELS[t] ?? t;
}
</script>

<style scoped>
.cursor-pointer { cursor: pointer; }
</style>
