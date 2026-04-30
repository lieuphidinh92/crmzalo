/**
 * appointment-sync.ts — auto-create Appointment records from Zalo reminder messages.
 * Parses msginfo.actionlist payloads and syncs them to the CRM appointments table.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';

interface ZaloReminderData {
  title: string;
  appointmentDate: Date;
  contactName: string | null;
}

/** Parse Zalo reminder message content to extract appointment data */
export function parseZaloReminder(content: string): ZaloReminderData | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.action !== 'msginfo.actionlist') return null;

    const title: string = parsed.title || '';
    let appointmentDate: Date | null = null;
    let contactName: string | null = null;

    const params = typeof parsed.params === 'string'
      ? JSON.parse(parsed.params)
      : parsed.params;
    const highlights: any[] = params?.highLightsV2 || [];

    for (const h of highlights) {
      // Valid epoch ms timestamp (> year 2001)
      if (h.ts && h.ts > 1000000000000 && !appointmentDate) {
        appointmentDate = new Date(h.ts);
      }
      // Type 1 entries often contain patient name (not a time string)
      if (h.type === 1 && h.dpn && !/^\d{2}:\d{2}$/.test(h.dpn)) {
        contactName = h.dpn;
      }
    }

    if (!appointmentDate) return null;

    return { title, appointmentDate, contactName };
  } catch {
    return null;
  }
}

/** Auto-create appointment from Zalo reminder message. Fire-and-forget safe. */
export async function syncZaloReminder(
  orgId: string,
  contactId: string | null,
  content: string,
): Promise<void> {
  const reminder = parseZaloReminder(content);
  if (!reminder) return;

  // Require a real contactId — skip if none (e.g. self-sent with no contact)
  if (!contactId) {
    logger.debug('[appointment-sync] Skipping reminder sync — no contactId');
    return;
  }

  try {
    // Idempotency check: skip if appointment at same time already exists for this contact
    const existing = await prisma.appointment.findFirst({
      where: { orgId, contactId, appointmentDate: reminder.appointmentDate },
      select: { id: true },
    });
    if (existing) return;

    const timeStr = reminder.appointmentDate.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    await prisma.appointment.create({
      data: {
        id: randomUUID(),
        orgId,
        contactId,
        appointmentDate: reminder.appointmentDate,
        appointmentTime: timeStr,
        type: 'tai_kham',
        status: 'scheduled',
        notes: `[Zalo] ${reminder.title}`,
      },
    });

    logger.info(`[appointment-sync] Created appointment from Zalo reminder: "${reminder.title}"`);
  } catch (err) {
    logger.error('[appointment-sync] Error syncing Zalo reminder:', err);
  }
}
