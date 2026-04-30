<template>
  <div style="max-width: 760px;">
    <h1 class="text-h5 mb-4">
      <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
      Cấu hình
    </h1>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="ai">
        <v-icon start>mdi-brain</v-icon>
        AI
      </v-tab>
      <v-tab value="goals">
        <v-icon start>mdi-target</v-icon>
        Mục tiêu kinh doanh
      </v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- AI provider configuration -->
      <v-window-item value="ai">
        <v-card variant="outlined" :loading="aiLoading">
          <v-card-text>
            <v-row dense>
              <v-col cols="12">
                <v-select
                  v-model="form.provider"
                  :items="PROVIDER_OPTIONS"
                  item-title="title"
                  item-value="value"
                  label="Nhà cung cấp AI"
                  @update:model-value="onProviderChange"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="form.apiKey"
                  label="API Key"
                  type="password"
                  :placeholder="form.provider === 'local' ? 'Không cần API key' : 'Nhập API key mới (để trống giữ nguyên)'"
                  autocomplete="new-password"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="form.model"
                  label="Model"
                  :placeholder="PROVIDER_DEFAULTS[form.provider]?.model"
                />
              </v-col>
              <v-col v-if="form.provider === 'local'" cols="12">
                <v-text-field
                  v-model="form.baseUrl"
                  label="Base URL"
                  :placeholder="PROVIDER_DEFAULTS.local.baseUrl"
                />
              </v-col>
            </v-row>
          </v-card-text>

          <v-divider />

          <v-alert
            v-if="testResult"
            :type="testResult.success ? 'success' : 'error'"
            class="ma-4 mb-0"
            density="compact"
            variant="tonal"
          >
            {{ testResult.message }}
          </v-alert>

          <v-card-actions class="pa-4 pt-2">
            <v-btn
              variant="outlined"
              :loading="testing"
              prepend-icon="mdi-connection"
              @click="onTest"
            >
              Kiểm tra kết nối
            </v-btn>
            <v-spacer />
            <v-btn
              color="primary"
              :loading="aiSaving"
              prepend-icon="mdi-content-save"
              @click="onSaveAi"
            >
              Lưu cấu hình
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-window-item>

      <!-- Business goals configuration -->
      <v-window-item value="goals">
        <v-card variant="outlined" :loading="goalsLoading">
          <v-card-text>
            <v-alert
              v-if="!canEditGoals"
              type="info"
              variant="tonal"
              density="compact"
              class="mb-4"
            >
              Chỉ Owner / Admin mới được chỉnh sửa mục tiêu kinh doanh.
            </v-alert>

            <v-row dense>
              <v-col cols="12">
                <v-text-field
                  v-model.number="goalsForm.annualRevenue"
                  type="number"
                  min="0"
                  label="Mục tiêu doanh số năm (VND)"
                  prepend-inner-icon="mdi-cash-multiple"
                  :hint="`Để trống/0 = ẩn % mục tiêu trên Dashboard CEO`"
                  persistent-hint
                  :disabled="!canEditGoals"
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model.number="goalsForm.stuckDays"
                  type="number"
                  min="1"
                  label="Ngưỡng deal stuck (ngày)"
                  prepend-inner-icon="mdi-pipe"
                  :hint="`Mặc định ${defaults?.stuckDays ?? 14}`"
                  persistent-hint
                  :disabled="!canEditGoals"
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model.number="goalsForm.atRiskDays"
                  type="number"
                  min="1"
                  label="Ngưỡng cảnh báo churn (ngày)"
                  prepend-inner-icon="mdi-alert-outline"
                  :hint="`Mặc định ${defaults?.atRiskDays ?? 45}`"
                  persistent-hint
                  :disabled="!canEditGoals"
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model.number="goalsForm.churnDays"
                  type="number"
                  min="1"
                  label="Ngưỡng đã churn (ngày)"
                  prepend-inner-icon="mdi-account-cancel-outline"
                  :hint="`Mặc định ${defaults?.churnDays ?? 90}`"
                  persistent-hint
                  :disabled="!canEditGoals"
                />
              </v-col>
            </v-row>

            <v-alert
              v-if="goalsValidationError"
              type="error"
              variant="tonal"
              density="compact"
              class="mt-3"
            >
              {{ goalsValidationError }}
            </v-alert>
          </v-card-text>

          <v-divider />

          <v-card-actions class="pa-4 pt-2">
            <v-spacer />
            <v-btn
              color="primary"
              :loading="goalsSaving"
              :disabled="!canEditGoals || !!goalsValidationError"
              prepend-icon="mdi-content-save"
              @click="onSaveGoals"
            >
              Lưu mục tiêu
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-window-item>
    </v-window>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000" location="bottom right">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  useAiSettings,
  PROVIDER_OPTIONS,
  PROVIDER_DEFAULTS,
  type AiSettingsPayload,
} from '@/composables/use-ai-settings';
import { useBusinessGoals, type BusinessGoals } from '@/composables/use-business-goals';
import { useAuthStore } from '@/stores/auth';

const tab = ref('ai');

// ── AI tab ──────────────────────────────────────────────────────────
const {
  settings,
  loading: aiLoading,
  saving: aiSaving,
  testing,
  testResult,
  fetchSettings,
  saveSettings,
  testConnection,
} = useAiSettings();

const form = reactive<AiSettingsPayload>({
  provider: 'claude',
  apiKey: '',
  model: '',
  baseUrl: '',
});

function onProviderChange(provider: string) {
  const d = PROVIDER_DEFAULTS[provider];
  if (d) {
    form.model = '';
    form.baseUrl = d.baseUrl;
  }
}

async function onTest() {
  await testConnection({ ...form });
}

async function onSaveAi() {
  const ok = await saveSettings({ ...form });
  snackbar.value = ok
    ? { show: true, text: 'Lưu cấu hình AI thành công', color: 'success' }
    : { show: true, text: 'Lưu cấu hình AI thất bại', color: 'error' };
}

// ── Goals tab ──────────────────────────────────────────────────────
const {
  defaults,
  loading: goalsLoading,
  saving: goalsSaving,
  fetchGoals,
  updateGoals,
} = useBusinessGoals();

const authStore = useAuthStore();
const canEditGoals = computed(
  () => authStore.user?.role === 'owner' || authStore.user?.role === 'admin',
);

const goalsForm = reactive<BusinessGoals>({
  stuckDays: 14,
  atRiskDays: 45,
  churnDays: 90,
  annualRevenue: 0,
});

const goalsValidationError = computed(() => {
  if (goalsForm.atRiskDays >= goalsForm.churnDays) {
    return 'Ngưỡng cảnh báo churn phải nhỏ hơn ngưỡng đã churn.';
  }
  if (goalsForm.stuckDays < 1 || goalsForm.atRiskDays < 1 || goalsForm.churnDays < 1) {
    return 'Tất cả ngưỡng phải >= 1 ngày.';
  }
  if (goalsForm.annualRevenue < 0) {
    return 'Mục tiêu doanh số không được âm.';
  }
  return null;
});

async function onSaveGoals() {
  if (goalsValidationError.value) return;
  try {
    const updated = await updateGoals({ ...goalsForm });
    Object.assign(goalsForm, updated);
    snackbar.value = {
      show: true,
      text: 'Đã lưu mục tiêu kinh doanh',
      color: 'success',
    };
  } catch (err: any) {
    snackbar.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Lưu thất bại',
      color: 'error',
    };
  }
}

// ── Init ──────────────────────────────────────────────────────────
const snackbar = ref({ show: false, text: '', color: 'success' });

onMounted(async () => {
  await Promise.all([
    (async () => {
      await fetchSettings();
      form.provider = settings.value.provider;
      form.model = settings.value.model;
      form.baseUrl = settings.value.baseUrl;
      form.apiKey = '';
    })(),
    (async () => {
      try {
        const g = await fetchGoals(true);
        Object.assign(goalsForm, g);
      } catch {
        /* error already exposed via composable */
      }
    })(),
  ]);
});
</script>
