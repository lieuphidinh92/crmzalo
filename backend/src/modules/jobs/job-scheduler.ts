/**
 * Job scheduler — loads active jobs from DB and manages cron tasks.
 * Supports dynamic reschedule/stop via rescheduleJob().
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { runJob } from './analyzer.js';
import { logger } from '../../shared/utils/logger.js';

const scheduledJobs = new Map<string, cron.ScheduledTask>();

export async function startJobScheduler(): Promise<void> {
  const jobs = await prisma.job.findMany({
    where: { status: 'active', schedule: { not: null } },
  });

  for (const job of jobs) {
    if (job.schedule && cron.validate(job.schedule)) {
      const task = cron.schedule(job.schedule, async () => {
        logger.info(`[scheduler] Running job: ${job.name}`);
        try {
          await runJob(job.id);
        } catch (err) {
          logger.error(`[scheduler] Job ${job.name} failed:`, err);
        }
      });
      scheduledJobs.set(job.id, task);
    }
  }

  logger.info(`[scheduler] Started ${scheduledJobs.size} scheduled jobs`);
}

/**
 * Stop existing cron for jobId and start a new one if cronExpr is valid.
 * Pass null to just stop scheduling without starting a new task.
 */
export function rescheduleJob(jobId: string, cronExpr: string | null): void {
  const existing = scheduledJobs.get(jobId);
  if (existing) {
    existing.stop();
    scheduledJobs.delete(jobId);
  }

  if (cronExpr && cron.validate(cronExpr)) {
    const task = cron.schedule(cronExpr, async () => {
      try {
        await runJob(jobId);
      } catch (err) {
        logger.error(`[scheduler] Job ${jobId} failed:`, err);
      }
    });
    scheduledJobs.set(jobId, task);
    logger.info(`[scheduler] Rescheduled job ${jobId} with: ${cronExpr}`);
  }
}
