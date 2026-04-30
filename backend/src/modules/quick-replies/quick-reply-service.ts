/**
 * quick-reply-service.ts — domain logic for the 5 canonical
 * quick-reply templates.
 *
 * - One template set per organization (no per-user config).
 * - Five fixed `key` values; staff can edit content but not add/remove rows.
 * - Templates are auto-seeded on first GET so a fresh org never sees an
 *   empty list.
 */
import { prisma } from '../../shared/database/prisma-client.js';

/** Canonical keys — frozen list. */
export const QUICK_REPLY_KEYS = [
  'welcome',
  'pricing',
  'reward',
  'legal',
  'media',
] as const;

export type QuickReplyKey = (typeof QUICK_REPLY_KEYS)[number];

/** Public label shown in the chat-input chip + admin page. */
export const QUICK_REPLY_LABELS: Record<QuickReplyKey, string> = {
  welcome: 'Tin nhắn chào mừng',
  pricing: 'Báo giá',
  reward: 'Thưởng tích luỹ',
  legal: 'Giấy tờ pháp lý',
  media: 'Tư liệu Media',
};

/** Material Design icon for each chip. */
export const QUICK_REPLY_ICONS: Record<QuickReplyKey, string> = {
  welcome: 'mdi-hand-wave',
  pricing: 'mdi-tag-outline',
  reward: 'mdi-gift-outline',
  legal: 'mdi-file-document-outline',
  media: 'mdi-image-multiple-outline',
};

export const QUICK_REPLY_TYPES = ['text', 'link', 'image', 'combined'] as const;
export type QuickReplyType = (typeof QUICK_REPLY_TYPES)[number];

export function isValidKey(k: string): k is QuickReplyKey {
  return (QUICK_REPLY_KEYS as readonly string[]).includes(k);
}

export function isValidType(t: string): t is QuickReplyType {
  return (QUICK_REPLY_TYPES as readonly string[]).includes(t);
}

/**
 * Ensure all 5 canonical rows exist for the org. Idempotent — uses upsert
 * so concurrent first-loads don't race. Returns the full sorted list.
 */
export async function listForOrg(orgId: string) {
  // Upsert any missing canonical row with empty defaults.
  await Promise.all(
    QUICK_REPLY_KEYS.map((key) =>
      prisma.quickReplyTemplate.upsert({
        where: { orgId_key: { orgId, key } },
        create: { orgId, key, type: 'text', content: '' },
        update: {},
      }),
    ),
  );

  const rows = await prisma.quickReplyTemplate.findMany({
    where: { orgId },
  });

  // Return in canonical order regardless of insert order.
  return QUICK_REPLY_KEYS.map((key) => {
    const row = rows.find((r) => r.key === key)!;
    return {
      key: row.key as QuickReplyKey,
      label: QUICK_REPLY_LABELS[key],
      icon: QUICK_REPLY_ICONS[key],
      type: row.type as QuickReplyType,
      content: row.content,
      mediaUrl: row.mediaUrl,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  });
}

export interface UpdateInput {
  type: QuickReplyType;
  content?: string | null;
  mediaUrl?: string | null;
  updatedBy: string;
}

export async function updateForOrg(
  orgId: string,
  key: QuickReplyKey,
  input: UpdateInput,
) {
  const content = (input.content ?? '').trim();
  const mediaUrl = (input.mediaUrl ?? '').trim() || null;

  // Validation: type-specific requirements.
  if (input.type === 'image' && !mediaUrl) {
    throw Object.assign(new Error('Cần URL hình ảnh cho loại "image"'), {
      statusCode: 400,
    });
  }
  if (input.type === 'link' && !content && !mediaUrl) {
    throw Object.assign(
      new Error('Cần nội dung text hoặc URL cho loại "link"'),
      { statusCode: 400 },
    );
  }

  return prisma.quickReplyTemplate.update({
    where: { orgId_key: { orgId, key } },
    data: {
      type: input.type,
      content,
      mediaUrl,
      updatedBy: input.updatedBy,
    },
  });
}

/**
 * Build the actual payload(s) to feed `zca-js api.sendMessage`.
 * Returns an array — for "combined" we may want to send text + image
 * as two consecutive messages so the recipient sees both.
 *
 * Each entry is a tuple of [zcaPayload, contentForDb, contentTypeForDb].
 * The route layer handles rate-limit accounting and DB persistence.
 */
export function buildSendPayloads(template: {
  type: QuickReplyType;
  content: string;
  mediaUrl: string | null;
}): Array<{
  payload: { msg: string; attachments?: string[] };
  dbContent: string;
  dbType: 'text' | 'image' | 'link';
}> {
  const t = template.type;
  const content = template.content || '';
  const url = template.mediaUrl || '';

  if (t === 'text') {
    return [
      { payload: { msg: content }, dbContent: content, dbType: 'text' },
    ];
  }

  if (t === 'link') {
    // Append URL on its own line so Zalo renders link preview.
    const msg = url ? (content ? `${content}\n${url}` : url) : content;
    return [{ payload: { msg }, dbContent: msg, dbType: 'link' }];
  }

  if (t === 'image') {
    // zca-js accepts a URL string in `attachments`. If it can't fetch it,
    // the route handler will catch the error and fall back to text.
    return [
      {
        payload: { msg: content || '', attachments: [url] },
        dbContent: url,
        dbType: 'image',
      },
    ];
  }

  // combined — two messages: text first, then image.
  const out: ReturnType<typeof buildSendPayloads> = [];
  if (content) {
    out.push({ payload: { msg: content }, dbContent: content, dbType: 'text' });
  }
  if (url) {
    out.push({
      payload: { msg: '', attachments: [url] },
      dbContent: url,
      dbType: 'image',
    });
  }
  if (out.length === 0) {
    throw Object.assign(new Error('Mẫu trả lời nhanh đang trống'), {
      statusCode: 400,
    });
  }
  return out;
}
