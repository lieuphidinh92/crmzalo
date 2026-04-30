<template>
  <div class="pipeline-funnel">
    <div
      v-for="col in localColumns"
      :key="col.stage"
      class="pipeline-column"
    >
      <!-- Column header -->
      <div :class="['pipeline-column__header', `is-${col.stage}`]">
        <div class="d-flex align-center">
          <v-icon size="14" :color="STAGE_COLORS[col.stage]" class="mr-1">
            {{ stageIcon(col.stage) }}
          </v-icon>
          <span class="font-weight-bold">{{ col.label }}</span>
          <v-spacer />
          <span class="pipeline-column__count">{{ col.deals.length }}</span>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ formatVNDShort(columnTotalValue(col)) }} VND
        </div>
      </div>

      <!-- Drag-drop list -->
      <VueDraggable
        v-model="col.deals"
        :group="dragGroup"
        :animation="180"
        class="pipeline-column__body"
        :item-key="(d: PipelineDeal) => d.contactId"
        ghost-class="deal-ghost"
        chosen-class="deal-chosen"
        drag-class="deal-dragging"
        @end="onDragEnd($event, col.stage)"
      >
        <PipelineDealCard
          v-for="deal in col.deals"
          :key="deal.contactId"
          :deal="deal"
          class="mb-2"
        />
        <div
          v-if="col.deals.length === 0"
          class="pipeline-column__empty text-center pa-6"
        >
          <v-icon size="32" color="grey-darken-1">mdi-tray</v-icon>
          <div class="text-caption text-medium-emphasis mt-1">
            Chưa có deal
          </div>
        </div>
      </VueDraggable>
    </div>

    <!-- Optional reason prompt when moving to "ngung" -->
    <v-dialog v-model="reasonDialog" max-width="420" persistent>
      <v-card>
        <v-card-title class="text-h6">Lý do ngừng?</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="reasonText"
            label="Lý do (sẽ giúp leader thấy pattern)"
            placeholder="VD: Khách chê giá, đối thủ rẻ hơn 5%..."
            rows="3"
            auto-grow
            :rules="[(v: string) => !!v?.trim() || 'Cần điền lý do']"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="cancelReason">Huỷ (giữ stage cũ)</v-btn>
          <v-spacer />
          <v-btn
            color="error"
            :disabled="!reasonText.trim()"
            @click="confirmReason"
          >
            Xác nhận ngừng
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import PipelineDealCard from './PipelineDealCard.vue';
import {
  formatVNDShort,
  STAGE_COLORS,
  type PipelineColumn,
  type PipelineDeal,
  type PipelineStage,
} from '@/composables/use-pipeline';

interface Props {
  columns: PipelineColumn[];
  /** Whether the current user can drag every card (admin/owner) or only their own. */
  canMoveAny: boolean;
  /** Current user id (for member-permission visual hint, but server enforces). */
  currentUserId: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'move', payload: { contactId: string; toStage: PipelineStage; reason?: string; rollback: () => void }): void;
}>();

// Local working copy so vue-draggable-plus can re-order without server
// round-trips first.
const localColumns = ref<PipelineColumn[]>([]);
watch(
  () => props.columns,
  (cols) => {
    // Deep-ish clone so dragging mutates locals only.
    localColumns.value = cols.map((c) => ({ ...c, deals: [...c.deals] }));
  },
  { immediate: true, deep: true },
);

const dragGroup = { name: 'pipeline-deals', pull: true, put: true };

const reasonDialog = ref(false);
const reasonText = ref('');
const pendingMove = ref<{
  contactId: string;
  toStage: PipelineStage;
  rollback: () => void;
} | null>(null);

function stageIcon(stage: PipelineStage): string {
  const map: Record<PipelineStage, string> = {
    tiep_can: 'mdi-handshake-outline',
    da_bao_gia: 'mdi-tag-outline',
    dang_thu_hang: 'mdi-package-variant-closed',
    dai_ly_chinh_thuc: 'mdi-check-decagram-outline',
    ngung: 'mdi-cancel',
  };
  return map[stage];
}

function columnTotalValue(col: PipelineColumn): number {
  return col.deals.reduce((s, d) => s + (d.potentialValue || 0), 0);
}

function findOriginalDeal(contactId: string):
  | { stage: PipelineStage; deal: PipelineDeal }
  | null {
  for (const c of props.columns) {
    const d = c.deals.find((x) => x.contactId === contactId);
    if (d) return { stage: c.stage, deal: d };
  }
  return null;
}

function onDragEnd(_event: unknown, toStage: PipelineStage) {
  // Identify which deal moved by comparing local vs original. Vue-draggable
  // already mutated localColumns, so we look for any deal whose original
  // column != the column containing it now.
  const moved = findMovedDeal(toStage);
  if (!moved) return;

  // Permission: members can only move their own deals. Server will also
  // 403 but we surface a clean rollback before the round-trip.
  if (!props.canMoveAny && moved.deal.assignedUser?.id !== props.currentUserId) {
    rollbackOne(moved.deal.contactId);
    emit('move', {
      contactId: moved.deal.contactId,
      toStage,
      rollback: () => {
        /* already rolled back synchronously; emit just for toast */
      },
    });
    return;
  }

  const rollback = () => rollbackOne(moved.deal.contactId);

  // Going to "ngung" → ask for reason.
  if (toStage === 'ngung' && moved.fromStage !== 'ngung') {
    pendingMove.value = { contactId: moved.deal.contactId, toStage, rollback };
    reasonText.value = '';
    reasonDialog.value = true;
    return;
  }

  emit('move', { contactId: moved.deal.contactId, toStage, rollback });
}

function findMovedDeal(targetStage: PipelineStage): {
  deal: PipelineDeal;
  fromStage: PipelineStage;
} | null {
  // Find deals that exist in localColumns[targetStage] but not in
  // props.columns[targetStage].
  const targetLocal = localColumns.value.find((c) => c.stage === targetStage);
  if (!targetLocal) return null;
  const targetOrig = props.columns.find((c) => c.stage === targetStage);
  const origIds = new Set(targetOrig?.deals.map((d) => d.contactId) ?? []);
  const newDeal = targetLocal.deals.find((d) => !origIds.has(d.contactId));
  if (!newDeal) return null;
  // Locate original column.
  const orig = findOriginalDeal(newDeal.contactId);
  if (!orig) return null;
  return { deal: newDeal, fromStage: orig.stage };
}

function rollbackOne(contactId: string) {
  // Restore localColumns from props (full reset is simplest + cheap).
  localColumns.value = props.columns.map((c) => ({
    ...c,
    deals: [...c.deals],
  }));
  void contactId;
}

function cancelReason() {
  if (pendingMove.value) pendingMove.value.rollback();
  pendingMove.value = null;
  reasonDialog.value = false;
}

function confirmReason() {
  if (!pendingMove.value || !reasonText.value.trim()) return;
  emit('move', {
    contactId: pendingMove.value.contactId,
    toStage: pendingMove.value.toStage,
    reason: reasonText.value.trim(),
    rollback: pendingMove.value.rollback,
  });
  pendingMove.value = null;
  reasonDialog.value = false;
}
</script>

<style scoped>
.pipeline-funnel {
  display: grid;
  grid-template-columns: repeat(5, minmax(220px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.pipeline-column {
  background: var(--brand-navy-800);
  border: 1px solid var(--brand-navy-600);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  min-height: 480px;
  max-height: 75vh;
}

.pipeline-column__header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--brand-navy-600);
  font-size: 13px;
}

.pipeline-column__header.is-tiep_can { border-top: 3px solid #7A8AA0; border-radius: 12px 12px 0 0; }
.pipeline-column__header.is-da_bao_gia { border-top: 3px solid #3B82F6; border-radius: 12px 12px 0 0; }
.pipeline-column__header.is-dang_thu_hang { border-top: 3px solid #F59E0B; border-radius: 12px 12px 0 0; }
.pipeline-column__header.is-dai_ly_chinh_thuc { border-top: 3px solid #10B981; border-radius: 12px 12px 0 0; }
.pipeline-column__header.is-ngung { border-top: 3px solid #EF4444; border-radius: 12px 12px 0 0; }

.pipeline-column__count {
  background: var(--brand-navy-600);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.pipeline-column__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 200px;
}

.pipeline-column__empty {
  border: 1px dashed var(--brand-navy-500);
  border-radius: 10px;
  margin-top: 12px;
}

/* Drag-drop visual states */
.deal-ghost {
  opacity: 0.4;
  background: rgba(245, 158, 11, 0.12) !important;
  border-style: dashed !important;
}

.deal-chosen {
  border-color: var(--brand-amber-500) !important;
}

.deal-dragging {
  transform: rotate(1deg);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
}
</style>
