/**
 * compliance-logger.ts — fire-and-forget logger for sale-compliance
 * events. Inserts a row in `sale_compliance_log` so the CEO dashboard
 * can compute "tuân thủ" scores without sales doing anything extra.
 *
 * Hook callers should NEVER await — logging failure must not break
 * the user-facing action. We swallow + log, but we do not throw.
 */
import { prisma } from '../database/prisma-client.js';
import { logger } from './logger.js';

export type ComplianceAction =
  | 'note_updated'
  | 'stage_updated'
  | 'zalo_replied'
  | 'ai_insight_used';

interface LogInput {
  orgId: string;
  saleId: string;
  actionType: ComplianceAction;
  contactId?: string | null;
  metadata?: Record<string, unknown>;
}

export function logCompliance(input: LogInput): void {
  // Fire-and-forget; do not await.
  prisma.saleComplianceLog
    .create({
      data: {
        orgId: input.orgId,
        saleId: input.saleId,
        actionType: input.actionType,
        contactId: input.contactId ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    })
    .catch((err) => {
      logger.warn('[compliance-log] insert failed:', err);
    });
}
