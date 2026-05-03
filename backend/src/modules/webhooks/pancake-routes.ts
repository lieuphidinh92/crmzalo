/**
 * Pancake webhook endpoint — public route (no JWT).
 *
 * Auth via constant-time comparison of `X-Api-Key` against PANCAKE_API_KEY.
 * The handler MUST respond < 3s, so we persist the WebhookLog row first
 * then kick the heavy lifting via setImmediate.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import { processPancakeLead, type PancakePayload } from './pancake-processor.js';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function pancakeWebhookRoutes(app: FastifyInstance): Promise<void> {
  // GET handler for Pancake endpoint verification (Pancake sends GET to verify URL)
  app.get(
    '/api/webhooks/pancake',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send({ ok: true, service: 'pancake-webhook' });
    },
  );

  app.post(
    '/api/webhooks/pancake',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const providedKey =
        (request.headers['x-api-key'] as string | undefined) ?? '';

      // ── Auth ──────────────────────────────────────────────────────
      if (
        !config.pancakeApiKey ||
        !providedKey ||
        !safeEqual(providedKey, config.pancakeApiKey)
      ) {
        await prisma.webhookLog
          .create({
            data: {
              source: 'pancake',
              payload: (request.body ?? {}) as object,
              status: 'unauthorized',
              errorMessage: 'invalid_or_missing_api_key',
            },
          })
          .catch((e: unknown) => logger.error('[pancake] failed to log unauth:', e));
        return reply.status(401).send({ error: 'unauthorized' });
      }

      const body = (request.body ?? {}) as Partial<PancakePayload>;

      // ── Validate minimum required field ──────────────────────────
      if (!body.customer_phone || typeof body.customer_phone !== 'string') {
        await prisma.webhookLog.create({
          data: {
            source: 'pancake',
            payload: body as object,
            status: 'failed',
            errorMessage: 'missing_customer_phone',
          },
        });
        return reply.status(400).send({ error: 'customer_phone required' });
      }

      // ── Resolve org (single-tenant: first org wins) ──────────────
      const org = await prisma.organization.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!org) {
        await prisma.webhookLog.create({
          data: {
            source: 'pancake',
            payload: body as object,
            status: 'failed',
            errorMessage: 'no_org_found',
          },
        });
        return reply.status(500).send({ error: 'no organization configured' });
      }

      // ── Persist log first so background work can update its status ──
      const webhookLog = await prisma.webhookLog.create({
        data: {
          orgId: org.id,
          source: 'pancake',
          payload: body as object,
          status: 'received',
        },
      });

      // ── Kick processor in background ─────────────────────────────
      const io = (app as unknown as { io?: Server }).io ?? null;
      setImmediate(() => {
        processPancakeLead(body as PancakePayload, {
          orgId: org.id,
          webhookLogId: webhookLog.id,
          io,
        }).catch((err) => logger.error('[pancake] processor unhandled:', err));
      });

      return reply.status(200).send({ ok: true, log_id: webhookLog.id });
    },
  );
}
