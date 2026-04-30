/**
 * contact-ai-insight-routes.ts — endpoints supporting the customer-detail
 * slide-over panel for the B2B sales refactor.
 *
 *   GET  /api/v1/contacts/:id/conversations   — list Zalo threads linked
 *                                                to a contact (used by the
 *                                                "click phone → open chat"
 *                                                action).
 *   POST /api/v1/contacts/:id/ai-insight      — incremental Claude analysis
 *                                                of recent chat. Re-runs only
 *                                                consider messages newer than
 *                                                the last `aiInsightUpdatedAt`.
 *
 * The AI prompt is the one supplied by the product brief; we ask Claude for
 * a JSON object and persist it raw so the front-end can render structured
 * fields (relationship_temperature, recommended_actions, …).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { getAIProvider } from '../jobs/provider-factory.js';
import { logCompliance } from '../../shared/utils/compliance-logger.js';

/** Hard cap so we never blow past Claude's input budget on a long thread. */
const MAX_MESSAGES_PER_RUN = 200;
/** Defensive char cap (~50K) — counts AS one big string after formatting. */
const MAX_TRANSCRIPT_CHARS = 50_000;

const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích khách hàng B2B ngành TPCN (thực phẩm chức năng).
Bạn luôn trả về JSON thuần tuý, không kèm markdown, không kèm giải thích thêm.
Cấu trúc bắt buộc:
{
  "summary": "Tóm tắt 2-3 câu về khách hàng này",
  "pain_points": ["nỗi đau / vấn đề khách đang gặp"],
  "buying_signals": ["dấu hiệu muốn mua / quan tâm"],
  "objections": ["phản đối / lo ngại khách đã nêu"],
  "recommended_actions": ["hành động cụ thể nên làm tiếp theo"],
  "best_time_to_contact": "thời điểm phù hợp để liên hệ nếu có",
  "relationship_temperature": "cold | warm | hot"
}`;

interface InsightShape {
  summary: string;
  pain_points: string[];
  buying_signals: string[];
  objections: string[];
  recommended_actions: string[];
  best_time_to_contact: string;
  relationship_temperature: 'cold' | 'warm' | 'hot' | string;
}

/**
 * Pull a JSON object out of a Claude response that may or may not be
 * wrapped in code fences. Falls back to a structured "parse failure"
 * payload so the UI never breaks.
 */
function extractInsightJson(raw: string): InsightShape | null {
  const trimmed = raw.trim();
  // Strip ```json … ``` fences if Claude added them despite the system prompt.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonStr = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null) return parsed as InsightShape;
  } catch {
    /* fall through */
  }
  // Last-ditch: find first { … last }.
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(jsonStr.slice(start, end + 1)) as InsightShape;
    } catch {
      /* swallow */
    }
  }
  return null;
}

function formatTranscript(
  messages: Array<{ senderType: string; senderName: string | null; content: string | null; sentAt: Date }>,
  contactName: string | null,
): string {
  return messages
    .map((m) => {
      const time = m.sentAt.toISOString().slice(0, 16).replace('T', ' ');
      const who =
        m.senderType === 'self'
          ? 'Nhân viên'
          : (m.senderName || contactName || 'Khách');
      const body = (m.content || '').slice(0, 800).replace(/\s+/g, ' ').trim();
      return `[${time}] ${who}: ${body}`;
    })
    .join('\n');
}

export async function contactAiInsightRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts/:id/conversations ──────────────────────────────
  // Used by the "click phone → open chat" action. Returns the conversations
  // sorted by most recent activity so the UI can deeplink to the top one.
  app.get(
    '/api/v1/contacts/:id/conversations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const conversations = await prisma.conversation.findMany({
        where: { contactId: id, orgId: user.orgId },
        include: {
          zaloAccount: { select: { id: true, displayName: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
      });

      return { conversations };
    },
  );

  // ── POST /api/v1/contacts/:id/ai-insight ────────────────────────────────
  // Body: { reset?: boolean } — when reset=true we re-analyse the last 200
  // messages from scratch instead of doing the incremental update.
  app.post<{
    Params: { id: string };
    Body: { reset?: boolean };
  }>(
    '/api/v1/contacts/:id/ai-insight',
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params;
      const reset = request.body?.reset === true;

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          assignedUser: { select: { id: true, fullName: true } },
        },
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      // Resolve all conversations belonging to this contact and pull the
      // most recent messages across them. Phone-only contacts (no Zalo
      // thread) are still allowed but produce a trivially empty transcript.
      const conversations = await prisma.conversation.findMany({
        where: { contactId: id, orgId: user.orgId },
        select: { id: true },
      });
      const conversationIds = conversations.map((c) => c.id);

      // Incremental window: skip messages older than the previous insight
      // unless reset=true. The brief asks for "tin nhắn tiếp theo" — we
      // cap by sentAt > aiInsightUpdatedAt.
      const sinceCutoff =
        !reset && contact.aiInsightUpdatedAt
          ? contact.aiInsightUpdatedAt
          : null;

      const messageWhere: any = { conversationId: { in: conversationIds } };
      if (sinceCutoff) messageWhere.sentAt = { gt: sinceCutoff };

      const messages =
        conversationIds.length === 0
          ? []
          : await prisma.message.findMany({
              where: messageWhere,
              orderBy: { sentAt: 'desc' },
              take: MAX_MESSAGES_PER_RUN,
              select: {
                senderType: true,
                senderName: true,
                content: true,
                sentAt: true,
              },
            });

      // No new chat since last insight → don't burn an API call.
      if (sinceCutoff && messages.length === 0) {
        return reply.status(200).send({
          status: 'unchanged',
          message:
            'Chưa có tin nhắn mới kể từ lần cập nhật trước. Insight giữ nguyên.',
          insight: contact.aiInsight,
          updatedAt: contact.aiInsightUpdatedAt,
        });
      }

      // First-ever run with truly empty conversation history → tell the
      // caller, no point pinging Claude.
      if (messages.length === 0) {
        return reply.status(200).send({
          status: 'no_messages',
          message: 'Khách hàng này chưa có tin nhắn nào để phân tích.',
          insight: null,
          updatedAt: null,
        });
      }

      // Format chronologically (DB returned newest-first for the slice).
      const ordered = messages.slice().reverse();
      let transcript = formatTranscript(ordered, contact.fullName);
      if (transcript.length > MAX_TRANSCRIPT_CHARS) {
        transcript = transcript.slice(-MAX_TRANSCRIPT_CHARS);
      }

      const userPrompt = `Dưới đây là lịch sử hội thoại Zalo (${
        sinceCutoff ? 'phần TIN NHẮN MỚI kể từ lần phân tích trước' : 'tổng hợp gần đây'
      }) giữa nhân viên và khách hàng:

${transcript}

Thông tin khách hàng:
- Tên: ${contact.fullName ?? '(chưa rõ)'}
- Loại: ${contact.customerType ?? '(chưa rõ)'}
- Giai đoạn: ${contact.stage ?? '(chưa rõ)'}
- Sản phẩm đang bán: ${
        Array.isArray(contact.currentProducts) && contact.currentProducts.length
          ? (contact.currentProducts as unknown[]).join(', ')
          : '(chưa rõ)'
      }
- Nhà cung cấp hiện tại: ${contact.currentSupplier ?? '(chưa rõ)'}
${
  sinceCutoff && contact.aiInsight
    ? `\nInsight cũ (chỉ để tham khảo, hãy CẬP NHẬT chứ không lặp lại y nguyên):\n${JSON.stringify(
        contact.aiInsight,
      )}\n`
    : ''
}
Hãy phân tích và trả về JSON theo cấu trúc đã yêu cầu trong system prompt. Không thêm markdown, không thêm giải thích.`;

      try {
        const provider = await getAIProvider(user.orgId);
        const aiRes = await provider.analyzeChat(SYSTEM_PROMPT, userPrompt);
        const insight = extractInsightJson(aiRes.content);

        if (!insight) {
          logger.warn('[contact-ai-insight] Could not parse AI JSON', {
            sample: aiRes.content.slice(0, 200),
          });
          return reply.status(502).send({
            error:
              'Không phân tích được phản hồi của AI (định dạng JSON không hợp lệ). Hãy thử lại sau.',
          });
        }

        // Persist + bump timestamp. The timestamp doubles as the cursor for
        // the next incremental run.
        const updatedAt = new Date();
        const updated = await prisma.contact.update({
          where: { id },
          data: {
            aiInsight: insight as object,
            aiInsightUpdatedAt: updatedAt,
          },
          select: { aiInsight: true, aiInsightUpdatedAt: true },
        });

        // Compliance hook: tag the assigned sale (or the user who clicked
        // if no assignment) so the metric correctly attributes "AI Insight
        // before stage decision" behaviour.
        const saleId = contact.assignedUserId ?? user.id;
        logCompliance({
          orgId: user.orgId,
          saleId,
          actionType: 'ai_insight_used',
          contactId: id,
          metadata: {
            triggeredBy: user.id,
            messagesAnalyzed: messages.length,
            wasReset: reset,
          },
        });

        return {
          status: sinceCutoff ? 'updated' : 'created',
          insight: updated.aiInsight,
          updatedAt: updated.aiInsightUpdatedAt,
          messagesAnalyzed: messages.length,
          tokensUsed: {
            input: aiRes.inputTokens,
            output: aiRes.outputTokens,
          },
        };
      } catch (err: any) {
        logger.error('[contact-ai-insight] AI call failed:', err);
        const message = err?.message ?? 'Gọi AI thất bại';
        return reply.status(500).send({ error: message });
      }
    },
  );
}
