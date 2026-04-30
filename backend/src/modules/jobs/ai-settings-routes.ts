/**
 * AI settings routes — get/save/test AI provider configuration per org.
 * Keys stored as AppSetting records: ai_provider, ai_api_key, ai_model, ai_base_url.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { getAIProvider } from './provider-factory.js';
import { logger } from '../../shared/utils/logger.js';

const AI_KEYS = ['ai_provider', 'ai_api_key', 'ai_model', 'ai_base_url'] as const;
type AIKey = typeof AI_KEYS[number];

async function upsertSetting(orgId: string, key: AIKey, value: string) {
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey: key } },
    update: { valuePlain: value },
    create: { id: randomUUID(), orgId, settingKey: key, valuePlain: value },
  });
}

export async function aiSettingsRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = [authMiddleware, requireRole('owner', 'admin')];

  // ── GET /api/v1/settings/ai — get config (never return api key) ───────────
  app.get('/api/v1/settings/ai', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = req.user!;
      const settings = await prisma.appSetting.findMany({
        where: { orgId, settingKey: { in: ['ai_provider', 'ai_model', 'ai_base_url'] } },
      });
      const result: Record<string, string> = {};
      for (const s of settings) result[s.settingKey] = s.valuePlain || '';
      // Indicate if api key is set without exposing value
      const keyRecord = await prisma.appSetting.findUnique({
        where: { orgId_settingKey: { orgId, settingKey: 'ai_api_key' } },
      });
      result.hasApiKey = keyRecord?.valuePlain ? 'true' : 'false';
      return result;
    } catch (err) {
      logger.error('[ai-settings] Get error:', err);
      return reply.status(500).send({ error: 'Failed to fetch AI settings' });
    }
  });

  // ── PUT /api/v1/settings/ai — save config ─────────────────────────────────
  app.put('/api/v1/settings/ai', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = req.user!;
      const body = req.body as Record<string, string>;

      const updates: Array<Promise<void>> = [];
      if (body.provider !== undefined) updates.push(upsertSetting(orgId, 'ai_provider', body.provider));
      if (body.apiKey !== undefined) updates.push(upsertSetting(orgId, 'ai_api_key', body.apiKey));
      if (body.model !== undefined) updates.push(upsertSetting(orgId, 'ai_model', body.model));
      if (body.baseUrl !== undefined) updates.push(upsertSetting(orgId, 'ai_base_url', body.baseUrl));

      await Promise.all(updates);
      return { success: true };
    } catch (err) {
      logger.error('[ai-settings] Save error:', err);
      return reply.status(500).send({ error: 'Failed to save AI settings' });
    }
  });

  // ── POST /api/v1/settings/ai/test — test connection ──────────────────────
  app.post('/api/v1/settings/ai/test', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = req.user!;
      const provider = await getAIProvider(orgId);
      const response = await provider.analyzeChat(
        'You are a test assistant. Reply with a short JSON.',
        'Say hello in JSON: {"hello": "world"}',
      );
      return {
        success: true,
        provider: response.provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        preview: response.content.slice(0, 200),
      };
    } catch (err) {
      logger.error('[ai-settings] Test error:', err);
      return reply.status(400).send({ error: String(err) });
    }
  });
}
