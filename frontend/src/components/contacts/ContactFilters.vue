<template>
  <v-row dense class="mb-2 align-center">
    <!-- Search (name / phone / store) -->
    <v-col cols="12" sm="4">
      <v-text-field
        v-model="filters.search"
        prepend-inner-icon="mdi-magnify"
        label="Tìm kiếm tên / SĐT / cửa hàng"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Customer type -->
    <v-col cols="6" sm="2">
      <v-select
        v-model="filters.customerType"
        :items="CUSTOMER_TYPE_OPTIONS"
        item-title="text"
        item-value="value"
        label="Loại KH"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Stage -->
    <v-col cols="6" sm="2">
      <v-select
        v-model="filters.stage"
        :items="STAGE_OPTIONS"
        item-title="text"
        item-value="value"
        label="Stage"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Policy tier -->
    <v-col cols="6" sm="2">
      <v-select
        v-model="filters.policyTier"
        :items="POLICY_TIER_OPTIONS"
        item-title="text"
        item-value="value"
        label="Chính sách"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Source -->
    <v-col cols="6" sm="2">
      <v-select
        v-model="filters.source"
        :items="SOURCE_OPTIONS"
        item-title="text"
        item-value="value"
        label="Nguồn"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Days inactive bucket -->
    <v-col cols="12" sm="3">
      <v-select
        v-model="filters.daysInactiveBucket"
        :items="DAYS_INACTIVE_OPTIONS"
        item-title="text"
        item-value="value"
        label="Số ngày chưa đặt"
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- PR2: Customer rank -->
    <v-col cols="12" sm="3">
      <v-select
        v-model="filters.customerRank"
        :items="CUSTOMER_RANK_FILTER_OPTIONS"
        item-title="text"
        item-value="value"
        label="Hạng KH"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import type { ContactFilters } from '@/composables/use-contacts';
import {
  SOURCE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  STAGE_OPTIONS,
  POLICY_TIER_OPTIONS,
  DAYS_INACTIVE_OPTIONS,
  CUSTOMER_RANK_FILTER_OPTIONS,
} from '@/composables/use-contacts';

defineProps<{ filters: ContactFilters }>();
const emit = defineEmits<{ search: [] }>();
</script>
