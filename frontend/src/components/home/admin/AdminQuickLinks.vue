<template>
  <v-row dense>
    <v-col cols="6" md="3" v-for="link in links" :key="link.path">
      <v-card class="pa-4 quick-link h-100" @click="$emit('navigate', link.path)">
        <div class="quick-link__icon">{{ link.icon }}</div>
        <div class="quick-link__label">{{ link.label }}</div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
const links = [
  { icon: '📊', label: 'Dashboard CEO chi tiết', path: '/dashboard/ceo' },
  { icon: '💼', label: 'Pipeline tổng', path: '/reports/pipeline' },
  { icon: '📈', label: 'Báo cáo Resale', path: '/reports/resale' },
  { icon: '👥', label: 'Quản lý nhân viên', path: '/settings' },
];

defineEmits<{ (e: 'navigate', path: string): void }>();
</script>

<style scoped>
.quick-link {
  cursor: pointer;
  text-align: center;
  border: 1px solid var(--brand-navy-600);
  transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s;
}

.quick-link:hover {
  border-color: var(--brand-amber-500);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.15);
}

.quick-link__icon { font-size: 32px; margin-bottom: 8px; }
.quick-link__label { font-weight: 600; color: var(--text-primary); }
</style>
