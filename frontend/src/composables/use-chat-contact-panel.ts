/**
 * Composable for ChatContactPanel state and actions:
 * - Form population from contact (B2B fields only)
 * - Save contact via /contacts/:id
 * - Fetch AI insights and appointments
 */
import { ref, watch, reactive } from 'vue';
import {
  useContacts,
  type Contact,
} from '@/composables/use-contacts';
import { api } from '@/api/index';
import type { Appointment } from '@/components/chat/ChatAppointments.vue';

export interface AiResult {
  id: string;
  resultType: string;
  severity: string | null;
  ruleName: string | null;
  evidence: string | null;
  detail: unknown;
  confidence: number;
  createdAt: string;
}

export function useChatContactPanel(
  getContactId: () => string | null,
  getContact: () => Contact | null,
  onSaved: () => void,
) {
  const { updateContact, fetchContact } = useContacts();

  const saving = ref(false);
  const saveSuccess = ref(false);
  const saveError = ref(false);
  const aiResults = ref<AiResult[]>([]);
  const contactAppointments = ref<Appointment[]>([]);

  const form = reactive({
    fullName: '',
    phone: '',
    storeName: '',
    province: '',
    customerType: null as string | null,
    stage: null as string | null,
    policyTier: null as string | null,
    source: null as string | null,
    firstContactDate: '',
    nextContactDate: '',
    tags: [] as string[],
    notes: '',
    internalNote: '',
  });

  function populateForm(c: Contact) {
    form.fullName = c.fullName ?? '';
    form.phone = c.phone ?? '';
    form.storeName = c.storeName ?? '';
    form.province = c.province ?? '';
    form.customerType = c.customerType ?? null;
    form.stage = c.stage ?? null;
    form.policyTier = c.policyTier ?? null;
    form.source = c.source ?? null;
    form.firstContactDate = c.firstContactDate
      ? new Date(c.firstContactDate).toISOString().split('T')[0]
      : '';
    form.nextContactDate = c.nextContactDate
      ? new Date(c.nextContactDate).toISOString().split('T')[0]
      : '';
    form.tags = Array.isArray(c.tags) ? [...c.tags] : [];
    form.notes = c.notes ?? '';
    form.internalNote = c.internalNote ?? '';
  }

  async function fetchContactExtras(contactId: string) {
    try {
      const [aiRes, aptRes] = await Promise.all([
        api.get(`/contacts/${contactId}/ai-results`),
        api.get(`/contacts/${contactId}/appointments`),
      ]);
      aiResults.value = aiRes.data.results ?? [];
      contactAppointments.value = aptRes.data.appointments ?? [];
    } catch (err) {
      console.error('fetchContactExtras error:', err);
    }
  }

  async function reloadAppointments() {
    const id = getContactId();
    if (!id) return;
    try {
      const res = await api.get(`/contacts/${id}/appointments`);
      contactAppointments.value = res.data.appointments ?? [];
    } catch (err) {
      console.error('reloadAppointments error:', err);
    }
  }

  watch(
    getContact,
    (c) => {
      if (!c) return;
      populateForm(c);
      fetchContactExtras(c.id);
    },
    { immediate: true, deep: true },
  );

  async function saveContact() {
    const contactId = getContactId();
    if (!contactId) return;
    saving.value = true;
    saveSuccess.value = false;
    saveError.value = false;

    const result = await updateContact(contactId, {
      fullName: form.fullName || null,
      phone: form.phone || null,
      storeName: form.storeName || null,
      province: form.province || null,
      customerType: form.customerType || null,
      stage: form.stage || null,
      policyTier: form.policyTier || null,
      source: form.source || null,
      firstContactDate: form.firstContactDate
        ? new Date(form.firstContactDate + 'T00:00:00').toISOString()
        : null,
      nextContactDate: form.nextContactDate
        ? new Date(form.nextContactDate + 'T00:00:00').toISOString()
        : null,
      tags: form.tags,
      notes: form.notes || null,
      internalNote: form.internalNote || null,
    });

    saving.value = false;
    if (result) {
      const fresh = await fetchContact(contactId);
      if (fresh) populateForm(fresh);
      saveSuccess.value = true;
      onSaved();
      setTimeout(() => {
        saveSuccess.value = false;
      }, 2500);
    } else {
      saveError.value = true;
    }
  }

  return {
    form,
    saving, saveSuccess, saveError,
    aiResults, contactAppointments,
    saveContact, reloadAppointments,
  };
}
