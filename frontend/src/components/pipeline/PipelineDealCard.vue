<template>
  <div :class="['deal-card', { 'is-stuck': deal.isStuck }]">
    <div class="d-flex align-center mb-1">
      <div class="deal-card__name flex-grow-1 text-truncate" :title="deal.fullName ?? ''">
        {{ deal.fullName || '(Chưa có tên)' }}
      </div>
      <v-tooltip v-if="deal.isStuck" text="Đứng yên >14 ngày" location="top">
        <template #activator="{ props: tooltipProps }">
          <v-icon
            v-bind="tooltipProps"
            icon="mdi-alert-circle"
            color="error"
            size="16"
          />
        </template>
      </v-tooltip>
    </div>

    <div v-if="deal.storeName" class="text-caption text-medium-emphasis text-truncate mb-1">
      {{ deal.storeName }}
    </div>

    <div class="d-flex align-center" style="gap: 4px;">
      <v-chip
        v-if="deal.customerType"
        size="x-small"
        variant="tonal"
        color="info"
        density="compact"
      >
        {{ customerTypeLabel(deal.customerType) }}
      </v-chip>
      <v-spacer />
      <v-tooltip
        v-if="deal.assignedUser"
        :text="deal.assignedUser.fullName"
        location="top"
      >
        <template #activator="{ props: tooltipProps }">
          <v-avatar v-bind="tooltipProps" size="20" color="brand-navy-500" class="text-caption">
            {{ initials(deal.assignedUser.fullName) }}
          </v-avatar>
        </template>
      </v-tooltip>
    </div>

    <div class="d-flex align-center mt-2 deal-card__footer">
      <div class="deal-card__value">
        <v-icon size="12" color="primary" class="mr-1">mdi-cash</v-icon>
        {{ formatVNDShort(deal.potentialValue) }}
      </div>
      <v-spacer />
      <div class="deal-card__idle" :class="idleClass">
        <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>
        {{ idleLabel }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  customerTypeLabel,
  formatVNDShort,
  type PipelineDeal,
} from '@/composables/use-pipeline';

interface Props {
  deal: PipelineDeal;
}

const props = defineProps<Props>();

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const idleClass = computed(() => {
  if (props.deal.daysIdle > 14) return 'is-danger';
  if (props.deal.daysIdle > 7) return 'is-warning';
  return '';
});

const idleLabel = computed(() => {
  const d = props.deal.daysIdle;
  if (d === 0) return 'Hôm nay';
  if (d === 1) return '1 ngày';
  return `${d} ngày`;
});
</script>

<style scoped>
.deal-card {
  background: var(--brand-navy-700);
  border: 1px solid var(--brand-navy-600);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: grab;
  transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s;
}

.deal-card:hover {
  border-color: var(--brand-amber-500);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);
}

.deal-card:active {
  cursor: grabbing;
}

.deal-card.is-stuck {
  border-left: 3px solid #EF4444;
  background: linear-gradient(
    90deg,
    rgba(239, 68, 68, 0.08) 0%,
    var(--brand-navy-700) 30%
  );
}

.deal-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.deal-card__footer {
  font-size: 11px;
  color: var(--text-secondary);
}

.deal-card__value {
  font-weight: 600;
  color: var(--text-primary);
}

.deal-card__idle.is-warning {
  color: var(--brand-amber-500);
}

.deal-card__idle.is-danger {
  color: #EF4444;
  font-weight: 600;
}
</style>
