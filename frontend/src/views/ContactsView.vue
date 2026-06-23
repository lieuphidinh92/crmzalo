<template>
  <div>
    <!-- Toolbar -->
    <div class="d-flex align-center mb-1 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">Khách hàng</h1>
      <v-spacer />
      <ContactColumnPicker
        v-model="visibleColumns"
        :columns="columnDefs"
        class="mr-2"
      />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
        Thêm KH
      </v-btn>
    </div>
    <div class="page-subtitle mb-3">
      Tổng <strong>{{ summary.total }}</strong> KH ·
      <span class="text-success">{{ summary.active }}</span> active ·
      <span class="text-warning">{{ summary.needCare }}</span> cần chăm
    </div>

    <!-- Filters -->
    <ContactFilters :filters="filters" @search="onFilterChange" />

    <!-- Data table -->
    <v-data-table-server
      :headers="visibleHeaders"
      :items="contacts"
      :loading="loading"
      :items-per-page="pagination.limit"
      :items-length="total"
      :page="pagination.page"
      :items-per-page-options="ITEMS_PER_PAGE_OPTIONS"
      :sort-by="vuetifySortBy"
      item-value="id"
      hover
      @click:row="onRowClick"
      @update:page="onPageChange"
      @update:items-per-page="onLimitChange"
      @update:sort-by="onSortChange"
    >
      <!-- PR3: Header filter menus — click icon mdi-filter-variant để mở.
           Active icon hiện màu primary khi filter có giá trị. -->
      <template #header.customerCode="{ column }">
        <div class="d-flex align-center">
          <span>{{ column.title }}</span>
          <v-menu :close-on-content-click="false" location="bottom start">
            <template #activator="{ props }">
              <v-icon
                v-bind="props"
                size="14"
                class="ml-1"
                :color="filters.search ? 'primary' : ''"
                @click.stop
              >mdi-filter-variant</v-icon>
            </template>
            <div class="pa-3 bg-surface" style="min-width: 240px">
              <v-text-field
                v-model="filters.search"
                label="Tìm theo mã / tên / SĐT"
                density="compact"
                clearable
                hide-details
                autofocus
                @update:model-value="onFilterChange"
              />
            </div>
          </v-menu>
        </div>
      </template>

      <template #header.customerRank="{ column }">
        <div class="d-flex align-center">
          <span>{{ column.title }}</span>
          <v-icon
            size="14"
            class="ml-1 sort-btn"
            :color="isSortActive('customerRank', 'desc') ? 'primary' : ''"
            title="Hạng cao xuống thấp"
            @click.stop="setSort('customerRank', 'desc')"
          >mdi-sort-descending</v-icon>
          <v-icon
            size="14"
            class="sort-btn"
            :color="isSortActive('customerRank', 'asc') ? 'primary' : ''"
            title="Hạng thấp lên cao"
            @click.stop="setSort('customerRank', 'asc')"
          >mdi-sort-ascending</v-icon>
          <v-menu :close-on-content-click="false" location="bottom start">
            <template #activator="{ props }">
              <v-icon
                v-bind="props"
                size="14"
                class="ml-1"
                :color="filters.customerRank ? 'primary' : ''"
                @click.stop
              >mdi-filter-variant</v-icon>
            </template>
            <div class="pa-3 bg-surface" style="min-width: 260px">
              <v-select
                v-model="filters.customerRank"
                :items="rankFilterOptions"
                item-title="text"
                item-value="value"
                label="Chọn hạng"
                density="compact"
                clearable
                hide-details
                @update:model-value="onFilterChange"
              />
            </div>
          </v-menu>
        </div>
      </template>

      <template #header.assignedUser="{ column }">
        <div class="d-flex align-center">
          <span>{{ column.title }}</span>
          <v-menu :close-on-content-click="false" location="bottom start">
            <template #activator="{ props }">
              <v-icon
                v-bind="props"
                size="14"
                class="ml-1"
                :color="filters.assignedUserId ? 'primary' : ''"
                @click.stop
              >mdi-filter-variant</v-icon>
            </template>
            <div class="pa-3 bg-surface" style="min-width: 260px">
              <v-autocomplete
                v-model="filters.assignedUserId"
                :items="salesOptions"
                item-title="fullName"
                item-value="id"
                label="Lọc theo sale"
                density="compact"
                clearable
                hide-details
                @update:model-value="onFilterChange"
              />
            </div>
          </v-menu>
        </div>
      </template>

      <template #header.revenueLifetime="{ column }">
        <div class="d-flex align-center">
          <span>{{ column.title }}</span>
          <v-icon
            size="14"
            class="ml-1 sort-btn"
            :color="isSortActive('revenueLifetime', 'desc') ? 'primary' : ''"
            title="Cao đến thấp"
            @click.stop="setSort('revenueLifetime', 'desc')"
          >mdi-sort-numeric-descending</v-icon>
          <v-icon
            size="14"
            class="sort-btn"
            :color="isSortActive('revenueLifetime', 'asc') ? 'primary' : ''"
            title="Thấp đến cao"
            @click.stop="setSort('revenueLifetime', 'asc')"
          >mdi-sort-numeric-ascending</v-icon>
          <v-menu :close-on-content-click="false" location="bottom start">
            <template #activator="{ props }">
              <v-icon
                v-bind="props"
                size="14"
                class="ml-1"
                :color="filters.minRevenue || filters.maxRevenue ? 'primary' : ''"
                @click.stop
              >mdi-filter-variant</v-icon>
            </template>
            <div class="pa-3 bg-surface" style="min-width: 240px">
              <div class="text-caption mb-1">Doanh số tổng (VND)</div>
              <div class="d-flex gap-2">
                <v-text-field
                  v-model="filters.minRevenue"
                  label="Tối thiểu"
                  type="number"
                  density="compact"
                  hide-details
                  @blur="onFilterChange"
                />
                <v-text-field
                  v-model="filters.maxRevenue"
                  label="Tối đa"
                  type="number"
                  density="compact"
                  hide-details
                  @blur="onFilterChange"
                />
              </div>
            </div>
          </v-menu>
        </div>
      </template>

      <template #header.profitLifetime="{ column }">
        <div class="d-flex align-center">
          <span>{{ column.title }}</span>
          <v-icon
            size="14"
            class="ml-1 sort-btn"
            :color="isSortActive('profitLifetime', 'desc') ? 'primary' : ''"
            title="Cao đến thấp"
            @click.stop="setSort('profitLifetime', 'desc')"
          >mdi-sort-numeric-descending</v-icon>
          <v-icon
            size="14"
            class="sort-btn"
            :color="isSortActive('profitLifetime', 'asc') ? 'primary' : ''"
            title="Thấp đến cao"
            @click.stop="setSort('profitLifetime', 'asc')"
          >mdi-sort-numeric-ascending</v-icon>
          <v-menu :close-on-content-click="false" location="bottom start">
            <template #activator="{ props }">
              <v-icon
                v-bind="props"
                size="14"
                class="ml-1"
                :color="filters.minProfit || filters.maxProfit ? 'primary' : ''"
                @click.stop
              >mdi-filter-variant</v-icon>
            </template>
            <div class="pa-3 bg-surface" style="min-width: 240px">
              <div class="text-caption mb-1">Lợi nhuận tổng (VND)</div>
              <div class="d-flex gap-2">
                <v-text-field
                  v-model="filters.minProfit"
                  label="Tối thiểu"
                  type="number"
                  density="compact"
                  hide-details
                  @blur="onFilterChange"
                />
                <v-text-field
                  v-model="filters.maxProfit"
                  label="Tối đa"
                  type="number"
                  density="compact"
                  hide-details
                  @blur="onFilterChange"
                />
              </div>
            </div>
          </v-menu>
        </div>
      </template>

      <!-- PR3.1 — 2 nút sort cho các cột số phụ (60d / năm / tháng / công nợ / điểm) -->
      <template #header.revenue60d="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('revenue60d','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('revenue60d','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('revenue60d','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('revenue60d','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.profit60d="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('profit60d','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('profit60d','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('profit60d','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('profit60d','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.revenueYtd="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('revenueYtd','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('revenueYtd','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('revenueYtd','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('revenueYtd','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.profitYtd="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('profitYtd','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('profitYtd','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('profitYtd','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('profitYtd','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.revenueMonth="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('revenueMonth','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('revenueMonth','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('revenueMonth','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('revenueMonth','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.profitMonth="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('profitMonth','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('profitMonth','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('profitMonth','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('profitMonth','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.debtAmount="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('debtAmount','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('debtAmount','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('debtAmount','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('debtAmount','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.rewardPoints="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('rewardPoints','desc')?'primary':''" title="Cao đến thấp" @click.stop="setSort('rewardPoints','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('rewardPoints','asc')?'primary':''" title="Thấp đến cao" @click.stop="setSort('rewardPoints','asc')">mdi-sort-numeric-ascending</v-icon></div></template>
      <template #header.daysSinceLastOrder="{ column }"><div class="d-flex align-center"><span>{{ column.title }}</span><v-icon size="14" class="ml-1 sort-btn" :color="isSortActive('daysSinceLastOrder','desc')?'primary':''" title="Lâu nhất trước" @click.stop="setSort('daysSinceLastOrder','desc')">mdi-sort-numeric-descending</v-icon><v-icon size="14" class="sort-btn" :color="isSortActive('daysSinceLastOrder','asc')?'primary':''" title="Gần đây nhất" @click.stop="setSort('daysSinceLastOrder','asc')">mdi-sort-numeric-ascending</v-icon></div></template>

      <template #header.birthday="{ column }">
        <div class="d-flex align-center">
          <span>{{ column.title }}</span>
          <v-menu :close-on-content-click="false" location="bottom start">
            <template #activator="{ props }">
              <v-icon
                v-bind="props"
                size="14"
                class="ml-1"
                :color="filters.hasBirthday || filters.birthdayWithin30d ? 'primary' : ''"
                @click.stop
              >mdi-filter-variant</v-icon>
            </template>
            <div class="pa-3 bg-surface" style="min-width: 220px">
              <v-select
                v-model="filters.hasBirthday"
                :items="HAS_BIRTHDAY_OPTIONS"
                item-title="text"
                item-value="value"
                label="Có sinh nhật?"
                density="compact"
                clearable
                hide-details
                class="mb-2"
                @update:model-value="onFilterChange"
              />
              <v-checkbox
                v-model="birthdayWithin30dChecked"
                label="Sinh nhật trong 30 ngày tới"
                density="compact"
                hide-details
                @update:model-value="onFilterChange"
              />
            </div>
          </v-menu>
        </div>
      </template>

      <!-- Avatar -->
      <template #item.avatarUrl="{ item }">
        <v-avatar size="32" color="grey-lighten-2">
          <v-img v-if="item.avatarUrl" :src="item.avatarUrl" />
          <v-icon v-else size="18">mdi-account</v-icon>
        </v-avatar>
      </template>

      <!-- Customer code (KH001 → KHnnn) -->
      <template #item.customerCode="{ item }">
        <span v-if="item.customerCode" class="font-mono text-caption">
          {{ item.customerCode }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- PR2: Hạng KH (top_1 → top_4 với score 0-100) -->
      <template #item.customerRank="{ item }">
        <v-chip
          v-if="item.customerRank"
          size="small"
          variant="flat"
          :color="customerRankColor(item.customerRank)"
          :title="`Điểm ${item.rankScore ?? 0}/100`"
        >
          {{ customerRankShortLabel(item.customerRank) }}
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- PR2: Sinh nhật -->
      <template #item.birthday="{ item }">
        <span v-if="item.birthday">
          {{ formatBirthday(item.birthday) }}
          <v-icon
            v-if="isBirthdaySoon(item.birthday)"
            size="14"
            color="amber"
            class="ml-1"
            title="Sinh nhật trong 30 ngày tới"
          >mdi-cake-variant</v-icon>
        </span>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- PR2: Lợi nhuận tổng (lifetime) -->
      <template #item.profitLifetime="{ item }">
        <span
          v-if="item.profitLifetime !== null && item.profitLifetime !== undefined && item.profitLifetime !== 0"
          :class="item.profitLifetime > 0 ? 'money-pos' : 'money-neg'"
        >
          {{ formatVNDShort(item.profitLifetime) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- PR2: 60-day metrics -->
      <template #item.revenue60d="{ item }">
        <span v-if="item.revenue60d && item.revenue60d > 0" class="money-pos">
          {{ formatVNDShort(item.revenue60d) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>
      <template #item.profit60d="{ item }">
        <span
          v-if="item.profit60d !== null && item.profit60d !== undefined && item.profit60d !== 0"
          :class="item.profit60d > 0 ? 'money-pos' : 'money-neg'"
        >
          {{ formatVNDShort(item.profit60d) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Name → opens insight panel -->
      <template #item.fullName="{ item }">
        <a
          href="#"
          class="contact-name-link"
          @click.stop.prevent="onNameClick(item)"
        >
          {{ item.fullName || '(Chưa có tên)' }}
        </a>
        <div v-if="item.storeName" class="text-caption text-medium-emphasis">
          {{ item.storeName }}
        </div>
      </template>

      <!-- Phone → opens Zalo chat -->
      <template #item.phone="{ item }">
        <a
          v-if="item.phone"
          href="#"
          class="phone-link"
          :title="`Mở chat Zalo với ${item.phone}`"
          @click.stop.prevent="onPhoneClick(item)"
        >
          <v-icon size="14" class="mr-1">mdi-chat-processing</v-icon>
          {{ item.phone }}
        </a>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Customer type chip -->
      <template #item.customerType="{ item }">
        <v-chip
          v-if="item.customerType"
          size="small"
          variant="tonal"
          color="info"
        >
          {{ customerTypeLabel(item.customerType) }}
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Stage chip (sales pipeline) -->
      <template #item.stage="{ item }">
        <v-chip
          v-if="item.stage"
          size="small"
          variant="flat"
          :color="stageColor(item.stage)"
        >
          {{ stageLabel(item.stage) }}
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Policy tier -->
      <template #item.policyTier="{ item }">
        <v-chip
          v-if="item.policyTier"
          size="small"
          variant="tonal"
          color="primary"
        >
          {{ policyTierLabel(item.policyTier) }}
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Source chip -->
      <template #item.source="{ item }">
        <v-chip v-if="item.source" size="small" variant="tonal">
          {{ sourceLabelOf(item.source) }}
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Date columns -->
      <template #item.nextContactDate="{ item }">
        {{ formatDate(item.nextContactDate) }}
      </template>
      <template #item.lastOrderDate="{ item }">
        {{ formatDate(item.lastOrderDate) }}
      </template>
      <template #item.firstContactDate="{ item }">
        {{ formatDate(item.firstContactDate) }}
      </template>

      <!-- Province / store / supplier -->
      <template #item.province="{ item }">
        {{ item.province || '—' }}
      </template>
      <template #item.currentSupplier="{ item }">
        {{ item.currentSupplier || '—' }}
      </template>
      <template #item.monthlyRevenueEstimate="{ item }">
        {{ item.monthlyRevenueEstimate || '—' }}
      </template>
      <template #item.debtAmount="{ item }">
        {{ formatCurrency(item.debtAmount) }}
      </template>
      <template #item.rewardPoints="{ item }">
        {{ item.rewardPoints ?? 0 }}
      </template>

      <!-- Assigned user -->
      <template #item.assignedUser="{ item }">
        <span class="text-body-2">{{ item.assignedUser?.fullName ?? '—' }}</span>
      </template>

      <!-- Days since last order — color badge by bucket -->
      <template #item.daysSinceLastOrder="{ item }">
        <v-chip
          v-if="item.daysSinceLastOrder !== null && item.daysSinceLastOrder !== undefined"
          size="small"
          variant="flat"
          :color="daysInactiveColor(item.daysSinceLastOrder)"
          class="font-mono"
        >
          {{ item.daysSinceLastOrder }} ngày
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Computed money columns -->
      <template #item.revenueYtd="{ item }">
        <span v-if="item.revenueYtd && item.revenueYtd > 0" class="money-pos">
          {{ formatVNDShort(item.revenueYtd) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>
      <template #item.profitYtd="{ item }">
        <span
          v-if="item.profitYtd !== null && item.profitYtd !== undefined && item.profitYtd !== 0"
          :class="item.profitYtd > 0 ? 'money-pos' : 'money-neg'"
        >
          {{ formatVNDShort(item.profitYtd) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>
      <template #item.revenueMonth="{ item }">
        <span v-if="item.revenueMonth && item.revenueMonth > 0" class="money-pos">
          {{ formatVNDShort(item.revenueMonth) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>
      <template #item.profitMonth="{ item }">
        <span
          v-if="item.profitMonth !== null && item.profitMonth !== undefined && item.profitMonth !== 0"
          :class="item.profitMonth > 0 ? 'money-pos' : 'money-neg'"
        >
          {{ formatVNDShort(item.profitMonth) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>
      <template #item.revenueLifetime="{ item }">
        <span v-if="item.revenueLifetime && item.revenueLifetime > 0" class="money-pos">
          {{ formatVNDShort(item.revenueLifetime) }}
        </span>
        <span v-else class="text-grey">—</span>
      </template>
    </v-data-table-server>

    <!-- Insight slide-over panel -->
    <ContactInsightPanel
      v-model="showPanel"
      :contact="selectedContact"
      @edit="onEditFromPanel"
      @open-chat="onPhoneClick"
      @updated="onInsightUpdated"
    />

    <!-- Edit/Create dialog (existing) -->
    <ContactDetailDialog
      v-model="showDialog"
      :contact="dialogContact"
      @saved="onSaved"
      @deleted="onDeleted"
    />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3000">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ContactFilters from '@/components/contacts/ContactFilters.vue';
import ContactDetailDialog from '@/components/contacts/ContactDetailDialog.vue';
import ContactInsightPanel from '@/components/contacts/ContactInsightPanel.vue';
import ContactColumnPicker, {
  type ColumnDef,
} from '@/components/contacts/ContactColumnPicker.vue';
import {
  useContacts,
  SOURCE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  STAGE_OPTIONS,
  POLICY_TIER_OPTIONS,
  CUSTOMER_RANK_FILTER_OPTIONS,
  customerRankShortLabel,
  customerRankColor,
  type Contact,
} from '@/composables/use-contacts';
import { formatVNDShort } from '@/composables/use-overview-report';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/index';

const {
  contacts,
  total,
  summary,
  loading,
  filters,
  pagination,
  sort,
  fetchContacts,
  fetchContact,
  fetchContactConversations,
} = useContacts();

const ITEMS_PER_PAGE_OPTIONS = [
  { value: 20, title: '20' },
  { value: 50, title: '50' },
  { value: 100, title: '100' },
  { value: 200, title: '200' },
  { value: -1, title: 'Tất cả' },
];

const router = useRouter();
const authStore = useAuthStore();

// ── Column visibility (persisted per-user) ────────────────────────────────
// Default columns prioritise the "Who needs my attention?" workflow:
// id/photo + name + phone for contact, customer type + sale for context,
// then days-inactive + revenue/profit YTD as the actionable signals.
// Stage/province/notes/etc are optional via the "Cột hiển thị" picker.
const columnDefs: ColumnDef[] = [
  { key: 'avatarUrl', title: 'Ảnh', alwaysVisible: true, defaultVisible: true },
  { key: 'customerCode', title: 'Mã KH', defaultVisible: true },
  { key: 'fullName', title: 'Tên', alwaysVisible: true, defaultVisible: true },
  { key: 'phone', title: 'SĐT', alwaysVisible: true, defaultVisible: true },
  { key: 'customerRank', title: 'Hạng KH', defaultVisible: true },
  { key: 'customerType', title: 'Loại KH', defaultVisible: false },
  { key: 'assignedUser', title: 'Sale', defaultVisible: true },
  { key: 'daysSinceLastOrder', title: 'Số ngày chưa đặt', defaultVisible: true },
  { key: 'revenueLifetime', title: 'Doanh số tổng', defaultVisible: true },
  { key: 'profitLifetime', title: 'Lợi nhuận tổng', defaultVisible: true },
  { key: 'birthday', title: 'Sinh nhật', defaultVisible: true },
  // Optional columns ────────────────────────────────────────────
  { key: 'revenueYtd', title: 'Doanh số năm', defaultVisible: false },
  { key: 'profitYtd', title: 'Lợi nhuận năm', defaultVisible: false },
  { key: 'revenue60d', title: 'Doanh số 60 ngày', defaultVisible: false },
  { key: 'profit60d', title: 'Lợi nhuận 60 ngày', defaultVisible: false },
  { key: 'stage', title: 'Stage', defaultVisible: false },
  { key: 'province', title: 'Tỉnh thành', defaultVisible: false },
  { key: 'nextContactDate', title: 'Liên hệ tiếp theo', defaultVisible: false },
  { key: 'revenueMonth', title: 'Doanh số tháng', defaultVisible: false },
  { key: 'profitMonth', title: 'Lợi nhuận tháng', defaultVisible: false },
  { key: 'policyTier', title: 'Chính sách', defaultVisible: false },
  { key: 'source', title: 'Nguồn', defaultVisible: false },
  { key: 'currentSupplier', title: 'NCC hiện tại', defaultVisible: false },
  { key: 'debtAmount', title: 'Công nợ', defaultVisible: false },
  { key: 'lastOrderDate', title: 'Đơn gần nhất', defaultVisible: false },
  { key: 'rewardPoints', title: 'Điểm thưởng', defaultVisible: false },
  { key: 'firstContactDate', title: 'Ngày tiếp nhận', defaultVisible: false },
];

const storageKey = computed(
  () => `crm_column_prefs_${authStore.user?.id ?? 'anon'}`,
);

const defaultVisible = columnDefs
  .filter((c) => c.alwaysVisible || c.defaultVisible)
  .map((c) => c.key);

const visibleColumns = ref<string[]>(loadPreferredColumns());

function loadPreferredColumns(): string[] {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (!raw) return defaultVisible;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultVisible;
    // Always include forced-visible columns even if user persisted older prefs.
    const always = columnDefs.filter((c) => c.alwaysVisible).map((c) => c.key);
    const next = Array.from(new Set([...always, ...parsed]));
    return next;
  } catch {
    return defaultVisible;
  }
}

watch(
  visibleColumns,
  (val) => {
    try {
      localStorage.setItem(storageKey.value, JSON.stringify(val));
    } catch {
      /* localStorage might be disabled */
    }
  },
  { deep: true },
);

// PR3 — Sort mở rộng cho mọi cột data. Backend handle:
//   - Scalar (Prisma orderBy): customerCode, customerRank→rankScore, birthday,
//     debtAmount, province, customerType, rewardPoints, lastOrderDate,
//     firstContactDate, nextContactDate, fullName, daysSinceLastOrder.
//   - Metric (fetch all + sort JS + slice): revenue/profit lifetime/60d/ytd/month.
const SORTABLE_KEYS = new Set([
  'fullName',
  'customerCode',
  'customerRank',
  'customerType',
  'province',
  'birthday',
  'debtAmount',
  'rewardPoints',
  'nextContactDate',
  'lastOrderDate',
  'firstContactDate',
  'daysSinceLastOrder',
  'revenueLifetime',
  'profitLifetime',
  'revenue60d',
  'profit60d',
  'revenueYtd',
  'profitYtd',
  'revenueMonth',
  'profitMonth',
]);

const visibleHeaders = computed(() =>
  columnDefs
    .filter((c) => visibleColumns.value.includes(c.key))
    .map((c) => ({
      title: c.title,
      key: c.key,
      sortable: SORTABLE_KEYS.has(c.key),
      width: c.key === 'avatarUrl' ? '48px' : undefined,
    })),
);

// Vuetify v-data-table-server emits sort-by as Array<{key, order}>; we
// keep the composable's flat shape and bridge here.
const vuetifySortBy = computed(() =>
  sort.orderBy ? [{ key: sort.orderBy, order: sort.order }] : [],
);

// ── Slide-over panel state ────────────────────────────────────────────────
const showPanel = ref(false);
const selectedContact = ref<Contact | null>(null);

const showDialog = ref(false);
const dialogContact = ref<Contact | null>(null);

const toast = ref({ show: false, text: '', color: 'success' as string });

// ── Label helpers ────────────────────────────────────────────────────────
function sourceLabelOf(value: string) {
  return SOURCE_OPTIONS.find((o) => o.value === value)?.text ?? value;
}

function customerTypeLabel(value: string) {
  return CUSTOMER_TYPE_OPTIONS.find((o) => o.value === value)?.text ?? value;
}

function stageLabel(value: string) {
  return STAGE_OPTIONS.find((o) => o.value === value)?.text ?? value;
}

function policyTierLabel(value: string) {
  return POLICY_TIER_OPTIONS.find((o) => o.value === value)?.text ?? value;
}

function stageColor(value: string): string {
  const map: Record<string, string> = {
    tiep_can: 'grey',
    da_bao_gia: 'info',
    dang_thu_hang: 'warning',
    dai_ly_chinh_thuc: 'success',
    ngung: 'error',
  };
  return map[value] ?? 'grey';
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

/** PR2: Sinh nhật format dd/MM (không hiện năm vì có thể không đủ chính xác). */
function formatBirthday(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/** PR2: True nếu sinh nhật trong vòng 30 ngày tới (so với hôm nay, ignore year). */
function isBirthdaySoon(d: string | null | undefined): boolean {
  if (!d) return false;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const thisYearBday = new Date(now.getFullYear(), date.getMonth(), date.getDate());
  let diff = thisYearBday.getTime() - now.getTime();
  if (diff < 0) {
    const nextYearBday = new Date(now.getFullYear() + 1, date.getMonth(), date.getDate());
    diff = nextYearBday.getTime() - now.getTime();
  }
  return diff <= 30 * 86400_000;
}

// PR3 — Filter header menus: options + sales list
const rankFilterOptions = CUSTOMER_RANK_FILTER_OPTIONS;
const HAS_BIRTHDAY_OPTIONS = [
  { value: 'yes', text: 'Đã có ngày sinh' },
  { value: 'no', text: 'Chưa có ngày sinh' },
];
const salesOptions = ref<Array<{ id: string; fullName: string }>>([]);

async function loadSales() {
  try {
    const res = await api.get('/users');
    salesOptions.value = (res.data.users ?? res.data ?? []).map((u: any) => ({
      id: u.id,
      fullName: u.fullName ?? u.email ?? u.id,
    }));
  } catch (err) {
    console.error('Failed to load sales list:', err);
  }
}

// Wrap string filter as boolean for v-checkbox
const birthdayWithin30dChecked = computed({
  get: () => filters.birthdayWithin30d === 'yes',
  set: (v: boolean) => {
    filters.birthdayWithin30d = v ? 'yes' : '';
  },
});

function formatCurrency(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(n);
}

// ── Event handlers ────────────────────────────────────────────────────────
function onFilterChange() {
  pagination.page = 1;
  fetchContacts();
}

function onPageChange(page: number) {
  pagination.page = page;
  fetchContacts();
}

function onLimitChange(limit: number) {
  pagination.limit = limit;
  pagination.page = 1;
  fetchContacts();
}

function onSortChange(sortArr: Array<{ key: string; order: 'asc' | 'desc' }>) {
  if (!sortArr || sortArr.length === 0) {
    sort.orderBy = '';
    sort.order = 'desc';
  } else {
    sort.orderBy = sortArr[0].key;
    sort.order = sortArr[0].order ?? 'desc';
  }
  pagination.page = 1;
  fetchContacts();
}

/**
 * PR3.1 — Click 1 trong 2 nút "↓ to-nhỏ" / "↑ nhỏ-to" trên header cột số.
 * Cùng dir đang active → bỏ sort (về mặc định).
 */
function setSort(key: string, dir: 'asc' | 'desc') {
  if (sort.orderBy === key && sort.order === dir) {
    sort.orderBy = '';
    sort.order = 'desc';
  } else {
    sort.orderBy = key;
    sort.order = dir;
  }
  pagination.page = 1;
  fetchContacts();
}

function isSortActive(key: string, dir: 'asc' | 'desc'): boolean {
  return sort.orderBy === key && sort.order === dir;
}

/** Map daysSinceLastOrder to the bucket color used in the badge.
 *  Boundaries mirror DAYS_BUCKET_* on the backend so labels stay aligned. */
function daysInactiveColor(days: number): string {
  if (days < 30) return 'success';
  if (days <= 60) return 'warning';
  if (days <= 90) return 'orange-darken-1';
  return 'error';
}

function openCreate() {
  dialogContact.value = null;
  showDialog.value = true;
}

/** Row click: legacy quick-edit dialog for staff who want to edit fast. */
function onRowClick(_event: Event, row: { item: Contact }) {
  // Open the slide-over panel by default (matches the spec). Staff can use
  // the "Chỉnh sửa" button inside to open the full edit dialog.
  selectedContact.value = row.item;
  showPanel.value = true;
}

/** Name click: explicit "open insight panel" affordance. */
async function onNameClick(item: Contact) {
  // Re-fetch so we get aiInsight / aiInsightUpdatedAt fields too. The list
  // endpoint omits aiInsight to keep payload light.
  selectedContact.value = item;
  showPanel.value = true;
  const fresh = await fetchContact(item.id);
  if (fresh && selectedContact.value?.id === item.id) {
    selectedContact.value = { ...item, ...fresh };
  }
}

/** Phone click: deeplink to chat with the most recent conversation. */
async function onPhoneClick(item: Contact) {
  try {
    const conversations = await fetchContactConversations(item.id);
    if (!conversations.length) {
      toast.value = {
        show: true,
        text: 'Chưa có hội thoại với khách này',
        color: 'warning',
      };
      return;
    }
    const target = conversations[0]; // newest first
    router.push({
      path: '/chat',
      query: { conversationId: target.id },
    });
  } catch (err: any) {
    toast.value = {
      show: true,
      text: err?.response?.data?.error ?? 'Không tìm được hội thoại',
      color: 'error',
    };
  }
}

function onEditFromPanel(contact: Contact) {
  dialogContact.value = contact;
  showDialog.value = true;
}

function onInsightUpdated(partial: Partial<Contact>) {
  if (!selectedContact.value) return;
  selectedContact.value = { ...selectedContact.value, ...partial };
  // Also patch the row in the table so timestamps stay in sync.
  const idx = contacts.value.findIndex(
    (c) => c.id === selectedContact.value?.id,
  );
  if (idx !== -1) {
    contacts.value[idx] = { ...contacts.value[idx], ...partial };
  }
}

function onSaved() {
  fetchContacts();
}

function onDeleted() {
  showPanel.value = false;
  selectedContact.value = null;
  fetchContacts();
}

onMounted(() => {
  fetchContacts();
  loadSales();
});
</script>

<style scoped>
.phone-link {
  display: inline-flex;
  align-items: center;
  color: var(--brand-amber-500);
  text-decoration: none;
  font-weight: 500;
}

.phone-link:hover {
  text-decoration: underline;
}

.contact-name-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 500;
}

.contact-name-link:hover {
  color: var(--brand-amber-500);
  text-decoration: underline;
}

.page-subtitle {
  font-size: 0.85rem;
  color: rgb(148, 163, 184);
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* PR3.1 — Sort buttons trên header table */
.sort-btn {
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s ease;
}
.sort-btn:hover {
  opacity: 1;
}

.money-pos {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgb(16, 185, 129);
  font-weight: 600;
}

.money-neg {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgb(239, 68, 68);
  font-weight: 600;
}
</style>
