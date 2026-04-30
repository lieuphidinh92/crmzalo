<template>
  <div>
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="primary" class="mr-1">mdi-robot</v-icon>
      <span class="text-caption font-weight-bold">AI Phân tích</span>
    </div>

    <div v-if="results.length > 0">
      <div
        v-for="result in results"
        :key="result.id"
        class="mb-2 pa-2"
        style="background: rgba(0,242,255,0.05); border-radius: 8px; border: 1px solid rgba(0,242,255,0.1);"
      >
        <div class="d-flex align-center mb-1">
          <v-chip
            size="x-small"
            :color="result.resultType === 'qc' ? 'primary' : 'info'"
            variant="tonal"
          >
            {{ result.resultType === 'qc' ? 'QC' : 'Phân loại' }}
          </v-chip>
          <v-chip
            v-if="result.ruleName"
            size="x-small"
            variant="outlined"
            class="ml-1"
          >
            {{ result.ruleName }}
          </v-chip>
          <v-spacer />
          <span class="text-caption" style="opacity: 0.5;">
            {{ formatDate(result.createdAt) }}
          </span>
        </div>
        <div class="text-body-2 mt-1">
          {{ result.evidence || getDetailSummary(result.detail) }}
        </div>
        <div
          v-if="result.confidence"
          class="text-caption mt-1"
          style="opacity: 0.6;"
        >
          Độ tin cậy: {{ Math.round(result.confidence * 100) }}%
        </div>
      </div>
    </div>

    <div v-else class="text-caption" style="opacity: 0.5;">Chưa có phân tích AI</div>
  </div>
</template>

<script setup lang="ts">
// Props
const props = defineProps<{
  results: Array<{
    id: string;
    resultType: string;
    severity: string | null;
    ruleName: string | null;
    evidence: string | null;
    detail: unknown;
    confidence: number;
    createdAt: string;
  }>;
}>();

// Format date to dd/MM
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// Extract summary text from detail JSON
function getDetailSummary(detail: unknown): string {
  if (!detail) return '';
  let parsed = detail;
  if (typeof detail === 'string') {
    try { parsed = JSON.parse(detail); } catch { return detail; }
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const d = parsed as Record<string, unknown>;
    return String(d.summary ?? d.review ?? '');
  }
  return '';
}
</script>
