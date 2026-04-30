/**
 * use-quick-replies — fetch the 5 canonical templates and send one
 * into a conversation. Single shared list per org so we cache it on
 * a module-level ref and refresh on demand.
 */
import { ref, readonly } from 'vue';
import { api } from '@/api/index';

export type QuickReplyKey = 'welcome' | 'pricing' | 'reward' | 'legal' | 'media';
export type QuickReplyType = 'text' | 'link' | 'image' | 'combined';

export interface QuickReplyTemplate {
  key: QuickReplyKey;
  label: string;
  icon: string;
  type: QuickReplyType;
  content: string;
  mediaUrl: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

const templates = ref<QuickReplyTemplate[]>([]);
const loading = ref(false);
const sending = ref<QuickReplyKey | null>(null);
const error = ref<string | null>(null);
let inflight: Promise<QuickReplyTemplate[]> | null = null;

async function fetchTemplates(force = false): Promise<QuickReplyTemplate[]> {
  if (!force && templates.value.length > 0) return templates.value;
  if (inflight) return inflight;

  loading.value = true;
  inflight = api
    .get<{ templates: QuickReplyTemplate[] }>('/quick-replies')
    .then((res) => {
      templates.value = res.data.templates;
      error.value = null;
      return templates.value;
    })
    .catch((err) => {
      error.value =
        err?.response?.data?.error ?? 'Không tải được mẫu trả lời nhanh';
      throw err;
    })
    .finally(() => {
      loading.value = false;
      inflight = null;
    });

  return inflight;
}

async function updateTemplate(
  key: QuickReplyKey,
  body: { type: QuickReplyType; content: string; mediaUrl: string | null },
) {
  const res = await api.put(`/quick-replies/${key}`, body);
  // Optimistic refresh — re-fetch so labels/icons stay canonical from BE.
  await fetchTemplates(true);
  return res.data;
}

async function sendQuickReply(conversationId: string, key: QuickReplyKey) {
  sending.value = key;
  try {
    const res = await api.post<{ sent: number; messages: unknown[] }>(
      `/conversations/${conversationId}/quick-reply`,
      { key },
    );
    return res.data;
  } finally {
    sending.value = null;
  }
}

export function useQuickReplies() {
  return {
    templates: readonly(templates),
    loading: readonly(loading),
    sending: readonly(sending),
    error: readonly(error),
    fetchTemplates,
    updateTemplate,
    sendQuickReply,
  };
}
