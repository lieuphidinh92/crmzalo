<template>
  <div class="cadence-view">
    <header class="mb-4">
      <h1 class="text-h5 font-weight-bold">⚙️ Cấu hình Cadence</h1>
      <p class="text-body-2 text-medium-emphasis ma-0">
        Tinh chỉnh các quy tắc tạo task tự động và mục tiêu cadence cho team.
      </p>
    </header>

    <v-tabs v-model="tab" color="amber" density="compact">
      <v-tab value="recurring">Recurring Rules</v-tab>
      <v-tab value="auto">Auto Triggers</v-tab>
      <v-tab value="targets">Mục tiêu</v-tab>
      <v-tab value="learning">Học tập</v-tab>
    </v-tabs>

    <v-window v-model="tab" class="mt-4">
      <v-window-item value="recurring">
        <v-card variant="flat" class="pa-2">
          <RecurringRulesTable @edit="openRecurringEdit" />
        </v-card>
      </v-window-item>

      <v-window-item value="auto">
        <v-card variant="flat" class="pa-2">
          <AutoRulesTable @edit="openAutoEdit" />
        </v-card>
      </v-window-item>

      <v-window-item value="targets">
        <TargetsTab />
      </v-window-item>

      <v-window-item value="learning">
        <LearningModulesAdminTab />
      </v-window-item>
    </v-window>

    <RecurringRuleDialog
      v-model="recurringDialogOpen"
      :rule="editingRecurring"
      @saved="onRecurringSaved"
      @tested="onRecurringTested"
    />

    <AutoRuleDialog
      v-model="autoDialogOpen"
      :rule="editingAuto"
      @saved="onAutoSaved"
    />

    <v-snackbar
      v-model="toastOpen"
      :timeout="3500"
      color="success"
      location="bottom right"
    >
      {{ toastMsg }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  useCadenceRules,
  type AutoRule,
  type RecurringRule,
} from '@/composables/use-cadence-rules';
import RecurringRulesTable from '@/components/cadence/RecurringRulesTable.vue';
import RecurringRuleDialog from '@/components/cadence/RecurringRuleDialog.vue';
import AutoRulesTable from '@/components/cadence/AutoRulesTable.vue';
import AutoRuleDialog from '@/components/cadence/AutoRuleDialog.vue';
import TargetsTab from '@/components/cadence/TargetsTab.vue';
import LearningModulesAdminTab from '@/components/cadence/LearningModulesAdminTab.vue';

const { fetchRecurringRules, fetchAutoRules } = useCadenceRules();

const tab = ref<'recurring' | 'auto' | 'targets' | 'learning'>('recurring');
const recurringDialogOpen = ref(false);
const autoDialogOpen = ref(false);
const editingRecurring = ref<RecurringRule | null>(null);
const editingAuto = ref<AutoRule | null>(null);
const toastOpen = ref(false);
const toastMsg = ref('');

function openRecurringEdit(rule: RecurringRule) {
  editingRecurring.value = rule;
  recurringDialogOpen.value = true;
}
function openAutoEdit(rule: AutoRule) {
  editingAuto.value = rule;
  autoDialogOpen.value = true;
}

function onRecurringSaved() {
  toastMsg.value = 'Đã lưu rule định kỳ';
  toastOpen.value = true;
}
function onAutoSaved() {
  toastMsg.value = 'Đã lưu rule tự động';
  toastOpen.value = true;
}
function onRecurringTested(_taskId: string) {
  toastMsg.value = 'Đã tạo 1 task TEST cho bạn — xem trong /tasks';
  toastOpen.value = true;
}

onMounted(async () => {
  await Promise.all([fetchRecurringRules(), fetchAutoRules()]);
});
</script>

<style scoped>
.cadence-view {
  padding: 8px 4px 32px;
}
</style>
