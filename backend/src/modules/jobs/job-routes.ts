/**
 * Job CRUD + trigger + run/result listing routes.
 * All endpoints require JWT auth and owner/admin role.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { runJob } from './analyzer.js';
import { rescheduleJob } from './job-scheduler.js';
import { logger } from '../../shared/utils/logger.js';

type Params = { id: string };
type RunParams = { id: string; runId: string };
type QueryParams = Record<string, string>;

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = [authMiddleware, requireRole('owner', 'admin')];

  // ── GET /api/v1/jobs — list jobs ──────────────────────────────────────────
  app.get('/api/v1/jobs', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const jobs = await prisma.job.findMany({
        where: { orgId: req.user!.orgId },
        orderBy: { createdAt: 'desc' },
      });
      return { jobs };
    } catch (err) {
      logger.error('[jobs] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch jobs' });
    }
  });

  // ── POST /api/v1/jobs — create job ────────────────────────────────────────
  app.post('/api/v1/jobs', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as Record<string, any>;
      if (!body.name || !body.jobType) {
        return reply.status(400).send({ error: 'name and jobType are required' });
      }
      const job = await prisma.job.create({
        data: {
          id: randomUUID(),
          orgId: req.user!.orgId,
          name: body.name,
          jobType: body.jobType,
          schedule: body.schedule || null,
          config: body.config || {},
          rulesContent: body.rulesContent || null,
          status: 'active',
        },
      });
      if (job.schedule) rescheduleJob(job.id, job.schedule);
      return reply.status(201).send(job);
    } catch (err) {
      logger.error('[jobs] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create job' });
    }
  });

  // ── PUT /api/v1/jobs/:id — update job ─────────────────────────────────────
  app.put('/api/v1/jobs/:id', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as Params;
      const body = req.body as Record<string, any>;
      const existing = await prisma.job.findFirst({ where: { id, orgId: req.user!.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Job not found' });

      const updated = await prisma.job.update({
        where: { id },
        data: {
          name: body.name,
          schedule: body.schedule ?? existing.schedule,
          config: body.config ?? existing.config,
          rulesContent: body.rulesContent ?? existing.rulesContent,
          status: body.status ?? existing.status,
        },
      });
      rescheduleJob(updated.id, updated.status === 'active' ? updated.schedule : null);
      return updated;
    } catch (err) {
      logger.error('[jobs] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update job' });
    }
  });

  // ── DELETE /api/v1/jobs/:id — delete job ──────────────────────────────────
  app.delete('/api/v1/jobs/:id', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as Params;
      const existing = await prisma.job.findFirst({ where: { id, orgId: req.user!.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Job not found' });
      rescheduleJob(id, null);
      await prisma.job.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[jobs] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete job' });
    }
  });

  // ── POST /api/v1/jobs/:id/trigger — run now ───────────────────────────────
  app.post('/api/v1/jobs/:id/trigger', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as Params;
      const existing = await prisma.job.findFirst({ where: { id, orgId: req.user!.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Job not found' });
      // Fire async — do not await
      runJob(id, true).catch(err => logger.error(`[jobs] Trigger failed for ${id}:`, err));
      return { triggered: true, jobId: id };
    } catch (err) {
      logger.error('[jobs] Trigger error:', err);
      return reply.status(500).send({ error: 'Failed to trigger job' });
    }
  });

  // ── GET /api/v1/jobs/:id/runs — list runs ─────────────────────────────────
  app.get('/api/v1/jobs/:id/runs', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as Params;
      const { page = '1', limit = '20' } = req.query as QueryParams;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const job = await prisma.job.findFirst({ where: { id, orgId: req.user!.orgId } });
      if (!job) return reply.status(404).send({ error: 'Job not found' });

      const [runs, total] = await Promise.all([
        prisma.jobRun.findMany({
          where: { jobId: id },
          orderBy: { startedAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.jobRun.count({ where: { jobId: id } }),
      ]);
      return { runs, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[jobs] Runs list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch runs' });
    }
  });

  // ── GET /api/v1/jobs/:id/runs/:runId/results — list results ──────────────
  app.get('/api/v1/jobs/:id/runs/:runId/results', { preHandler: adminOnly }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id, runId } = req.params as RunParams;
      const { page = '1', limit = '50' } = req.query as QueryParams;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const job = await prisma.job.findFirst({ where: { id, orgId: req.user!.orgId } });
      if (!job) return reply.status(404).send({ error: 'Job not found' });

      const [results, total] = await Promise.all([
        prisma.jobResult.findMany({
          where: { jobRunId: runId },
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.jobResult.count({ where: { jobRunId: runId } }),
      ]);
      return { results, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[jobs] Results list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch results' });
    }
  });
}
