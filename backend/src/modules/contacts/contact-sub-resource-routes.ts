/**
 * contact-sub-resource-routes.ts — Sub-resource endpoints for contacts.
 * Provides AI analysis results and appointments scoped to a specific contact.
 * All routes require JWT auth and are scoped to the user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function contactSubResourceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts/:id/ai-results — latest AI analysis for contact ──
  app.get('/api/v1/contacts/:id/ai-results', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const conversations = await prisma.conversation.findMany({
        where: { contactId: id, orgId: user.orgId },
        select: { id: true },
      });
      const convIds = conversations.map((c) => c.id);

      if (convIds.length === 0) return { results: [] };

      const results = await prisma.jobResult.findMany({
        where: { conversationId: { in: convIds } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          resultType: true,
          severity: true,
          ruleName: true,
          evidence: true,
          detail: true,
          confidence: true,
          createdAt: true,
        },
      });

      return { results };
    } catch (err) {
      logger.error('[contacts] AI results error:', err);
      return reply.status(500).send({ error: 'Failed to fetch AI results' });
    }
  });

  // ── GET /api/v1/contacts/:id/appointments — appointments for contact ───────
  app.get('/api/v1/contacts/:id/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const appointments = await prisma.appointment.findMany({
        where: { contactId: id, orgId: user.orgId },
        orderBy: { appointmentDate: 'desc' },
        take: 20,
      });

      return { appointments };
    } catch (err) {
      logger.error('[contacts] Appointments by contact error:', err);
      return reply.status(500).send({ error: 'Failed to fetch appointments' });
    }
  });
}
