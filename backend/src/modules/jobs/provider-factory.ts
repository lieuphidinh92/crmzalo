/**
 * AI provider factory — reads org settings from DB and returns configured provider.
 * Settings keys: ai_provider, ai_api_key, ai_model, ai_base_url
 */
import { prisma } from '../../shared/database/prisma-client.js';
import type { AIProvider } from './ai-provider.js';
import { ClaudeProvider } from './providers/claude-provider.js';
import { GeminiProvider } from './providers/gemini-provider.js';
import { LocalProvider } from './providers/local-llm-provider.js';
import { logger } from '../../shared/utils/logger.js';

export async function getAIProvider(orgId: string): Promise<AIProvider> {
  const settings = await prisma.appSetting.findMany({
    where: { orgId, settingKey: { startsWith: 'ai_' } },
  });

  const getSetting = (key: string) =>
    settings.find(s => s.settingKey === key)?.valuePlain || '';

  const provider = getSetting('ai_provider') || 'local';
  const apiKey = getSetting('ai_api_key');
  const model = getSetting('ai_model') || undefined;
  const baseUrl = getSetting('ai_base_url');

  logger.info(`[provider-factory] Using AI provider: ${provider} for org ${orgId}`);

  switch (provider) {
    case 'claude':
      if (!apiKey) throw new Error('Claude API key not configured');
      return new ClaudeProvider(apiKey, model);
    case 'gemini':
      if (!apiKey) throw new Error('Gemini API key not configured');
      return new GeminiProvider(apiKey, model);
    case 'local':
      return new LocalProvider(
        apiKey || 'no-key',
        baseUrl || 'https://ai.ngay.top/v1',
        model || 'qwen3-coder:latest',
      );
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
