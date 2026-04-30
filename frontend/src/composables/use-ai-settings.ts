/**
 * Composable for AI settings management:
 * - Fetch current AI provider config (no API key returned)
 * - Save settings (provider, apiKey, model, baseUrl)
 * - Test connection
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface AiSettings {
  provider: 'claude' | 'gemini' | 'local';
  model: string;
  baseUrl: string;
}

export interface AiSettingsPayload extends AiSettings {
  apiKey: string;
}

export const PROVIDER_OPTIONS = [
  { title: 'Claude (Anthropic)', value: 'claude' },
  { title: 'Gemini (Google)', value: 'gemini' },
  { title: 'Local LLM', value: 'local' },
];

export const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl: string }> = {
  claude: { model: 'claude-sonnet-4-20250514', baseUrl: '' },
  gemini: { model: 'gemini-2.0-flash', baseUrl: '' },
  local: { model: 'qwen3-coder:latest', baseUrl: 'https://ai.ngay.top/v1' },
};

export function useAiSettings() {
  const settings = ref<AiSettings>({ provider: 'claude', model: '', baseUrl: '' });
  const loading = ref(false);
  const saving = ref(false);
  const testing = ref(false);
  const testResult = ref<{ success: boolean; message: string } | null>(null);

  async function fetchSettings() {
    loading.value = true;
    try {
      const res = await api.get('/settings/ai');
      const d = res.data;
      // API returns ai_provider, ai_model, ai_base_url — map to clean names
      settings.value = {
        provider: (d.ai_provider || d.provider || 'local') as AiSettings['provider'],
        model: d.ai_model || d.model || '',
        baseUrl: d.ai_base_url || d.baseUrl || '',
      };
    } catch (err) {
      console.error('Failed to fetch AI settings:', err);
    } finally {
      loading.value = false;
    }
  }

  async function saveSettings(payload: AiSettingsPayload): Promise<boolean> {
    saving.value = true;
    try {
      await api.put('/settings/ai', payload);
      settings.value = { provider: payload.provider, model: payload.model, baseUrl: payload.baseUrl };
      return true;
    } catch (err) {
      console.error('Failed to save AI settings:', err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function testConnection(_payload: AiSettingsPayload): Promise<{ success: boolean; message: string }> {
    testing.value = true;
    testResult.value = null;
    try {
      const res = await api.post('/settings/ai/test', {});
      const d = res.data;
      testResult.value = {
        success: true,
        message: `${d.provider}/${d.model} — ${d.inputTokens}+${d.outputTokens} tokens — "${d.preview}"`,
      };
      return testResult.value;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Kết nối thất bại';
      testResult.value = { success: false, message: msg };
      return testResult.value;
    } finally {
      testing.value = false;
    }
  }

  return {
    settings, loading, saving, testing, testResult,
    fetchSettings, saveSettings, testConnection,
  };
}
