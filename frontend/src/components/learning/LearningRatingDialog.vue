<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
    max-width="420"
  >
    <v-card>
      <v-card-title>Đánh giá module</v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-3">Module này có hữu ích với bạn không?</p>
        <div class="stars">
          <v-btn
            v-for="n in 5"
            :key="n"
            icon
            variant="text"
            size="small"
            @click="score = n"
          >
            <v-icon :color="n <= score ? 'amber' : 'grey'" size="32">
              {{ n <= score ? 'mdi-star' : 'mdi-star-outline' }}
            </v-icon>
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn variant="text" @click="onSkip">Bỏ qua</v-btn>
        <v-spacer />
        <v-btn color="success" variant="flat" @click="onSubmit">Hoàn thành</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', score: number | null): void;
}>();

const score = ref(0);

watch(
  () => props.modelValue,
  (open) => {
    if (open) score.value = 0;
  },
);

function onSubmit() {
  emit('submit', score.value > 0 ? score.value : null);
  emit('update:modelValue', false);
}

function onSkip() {
  emit('submit', null);
  emit('update:modelValue', false);
}
</script>

<style scoped>
.stars {
  display: flex;
  justify-content: center;
  gap: 4px;
}
</style>
