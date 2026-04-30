/**
 * Job analyzer engine — fetches conversations, calls AI provider, saves results.
 * Orchestrates the full run lifecycle: create JobRun → analyze → update status.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { getAIProvider } from './provider-factory.js';
import { logger } from '../../shared/utils/logger.js';
import { buildSystemPrompt, formatTranscript, parseAIContent } from './analyzer-prompt-builder.js';

/**
 * Run a job analysis. When isManual=true (trigger button), analyzes last 7 days
 * regardless of lastRunAt to avoid "0 conversations" on re-trigger.
 */
export async function runJob(jobId: string, isManual = false): Promise<string> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  const run = await prisma.jobRun.create({
    data: {
      id: randomUUID(),
      jobId: job.id,
      startedAt: new Date(),
      status: 'running',
      summary: {},
    },
  });

  try {
    const provider = await getAIProvider(job.orgId);
    const config = (job.config as any) || {};
    const channelIds: string[] = config.channelIds || [];

    // Time window: manual trigger = last 7 days, scheduled = since last run or 24h
    const since = isManual
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      : (job.lastRunAt || new Date(Date.now() - 24 * 60 * 60 * 1000));

    const where: any = { orgId: job.orgId, lastMessageAt: { gte: since } };
    if (channelIds.length > 0) where.zaloAccountId = { in: channelIds };

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        messages: { orderBy: { sentAt: 'asc' }, take: 50 },
        contact: { select: { fullName: true, phone: true } },
      },
      take: config.maxConversations || 20,
    });

    let analyzed = 0;
    let errors = 0;
    const systemPrompt = buildSystemPrompt(job.jobType, job.rulesContent || '');

    for (const conv of conversations) {
      if (conv.messages.length === 0) continue;

      const transcript = formatTranscript(conv.messages, conv.contact?.fullName || 'Khách hàng');

      try {
        const aiResponse = await provider.analyzeChat(systemPrompt, transcript);
        const result = parseAIContent(aiResponse.content);

        await prisma.jobResult.create({
          data: {
            id: randomUUID(),
            jobRunId: run.id,
            conversationId: conv.id,
            resultType: job.jobType,
            severity: result.verdict || result.score?.toString() || null,
            ruleName: result.category || null,
            evidence: result.review || result.summary || null,
            detail: result,
            aiRawResponse: aiResponse.content,
            confidence: result.confidence || 1.0,
          },
        });

        analyzed++;
        // Rate-limit: avoid hammering AI APIs
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        logger.error(`[analyzer] AI error for conv ${conv.id}:`, err);
        errors++;
      }
    }

    const summary = { conversations_found: conversations.length, analyzed, errors };

    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: 'success', finishedAt: new Date(), summary },
    });

    await prisma.job.update({
      where: { id: job.id },
      data: { lastRunAt: new Date() },
    });

    logger.info(`[analyzer] Job ${job.name}: ${analyzed} analyzed, ${errors} errors`);
    return run.id;
  } catch (err) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: 'error', finishedAt: new Date(), errorMessage: String(err) },
    });
    throw err;
  }
}
