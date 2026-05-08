<template>
  <div v-if="hasAlerts" class="alerts-banner mb-3">
    <v-card variant="flat" class="banner-card">
      <div class="banner-row" @click="expanded = !expanded">
        <v-icon color="warning" class="mr-2">mdi-alert-circle-outline</v-icon>
        <span class="banner-title">Cảnh báo kho</span>

        <v-spacer />

        <v-chip
          v-if="summary.expiredCount > 0"
          size="small"
          color="error"
          variant="flat"
          class="ml-1"
        >
          {{ summary.expiredCount }} lô hết hạn
        </v-chip>
        <v-chip
          v-if="summary.lowStockCount > 0"
          size="small"
          color="error"
          variant="tonal"
          class="ml-1"
        >
          {{ summary.lowStockCount }} SP tồn thấp
        </v-chip>
        <v-chip
          v-if="summary.expiringCount > 0"
          size="small"
          color="warning"
          variant="tonal"
          class="ml-1"
        >
          {{ summary.expiringCount }} lô HSD &lt;90 ngày
        </v-chip>

        <v-btn
          icon
          variant="text"
          size="small"
          density="comfortable"
          class="ml-1"
        >
          <v-icon>{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
      </div>

      <v-expand-transition>
        <div v-if="expanded" class="banner-detail">
          <!-- Expired (most urgent) -->
          <div v-if="data && data.expired.length > 0" class="alert-section">
            <div class="alert-section-title">
              <v-icon size="16" color="error">mdi-clock-alert</v-icon>
              Lô đã hết hạn còn tồn ({{ data.expired.length }})
            </div>
            <ul class="alert-list">
              <li v-for="b in data.expired.slice(0, 5)" :key="b.batchId">
                <span class="font-mono">{{ b.batchCode }}</span>
                — {{ b.productName }} ({{ b.productSku }})
                · còn {{ b.currentQuantity }} hộp
                · HSD <strong>{{ b.expiryDate }}</strong>
                <span class="days-tag days-tag--expired">
                  {{ Math.abs(b.daysLeft) }} ngày trước
                </span>
              </li>
            </ul>
            <a class="see-all" @click.prevent="goInventory('expired')">
              Xem tất cả →
            </a>
          </div>

          <!-- Low stock -->
          <div v-if="data && data.lowStock.length > 0" class="alert-section">
            <div class="alert-section-title">
              <v-icon size="16" color="error">mdi-package-variant-remove</v-icon>
              Sản phẩm tồn thấp ({{ data.lowStock.length }})
            </div>
            <ul class="alert-list">
              <li v-for="p in data.lowStock.slice(0, 5)" :key="p.productId">
                <span class="font-mono">{{ p.sku }}</span>
                — {{ p.name }} · còn
                <strong class="text-error">{{ p.totalStock }}</strong>
                / cảnh báo {{ p.warningStock }} {{ p.unit ?? 'hộp' }}
              </li>
            </ul>
            <a class="see-all" @click.prevent="goLowStock()">
              Xem tất cả →
            </a>
          </div>

          <!-- Expiring soon -->
          <div v-if="data && data.expiringIn90.length > 0" class="alert-section">
            <div class="alert-section-title">
              <v-icon size="16" color="warning">mdi-calendar-clock</v-icon>
              Lô sắp hết hạn (&lt;90 ngày, {{ data.expiringIn90.length }})
            </div>
            <ul class="alert-list">
              <li v-for="b in data.expiringIn90.slice(0, 5)" :key="b.batchId">
                <span class="font-mono">{{ b.batchCode }}</span>
                — {{ b.productName }} ({{ b.productSku }})
                · còn {{ b.currentQuantity }} hộp
                · còn <strong>{{ b.daysLeft }} ngày</strong>
              </li>
            </ul>
            <a class="see-all" @click.prevent="goInventory('expiring')">
              Xem tất cả →
            </a>
          </div>
        </div>
      </v-expand-transition>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useInventoryAlerts } from '@/composables/use-inventory-alerts';

const router = useRouter();
const { data, hasAlerts, fetchAlerts } = useInventoryAlerts();

/** Default-collapsed so the banner takes minimal space; clicking any
 * part of the header expands it. */
const expanded = ref(false);

const summary = computed(
  () =>
    data.value?.summary ?? {
      lowStockCount: 0,
      expiringCount: 0,
      expiredCount: 0,
      totalCount: 0,
    },
);

onMounted(() => {
  fetchAlerts();
});

function goInventory(kind: 'expired' | 'expiring') {
  router.push({
    path: '/inventory',
    query: { tab: 'batches', expiryWindow: kind === 'expired' ? 'expired' : '90' },
  });
}
function goLowStock() {
  router.push({ path: '/inventory', query: { tab: 'lowstock' } });
}
</script>

<style scoped>
.alerts-banner {
  width: 100%;
}
.banner-card {
  background: linear-gradient(
    135deg,
    rgba(245, 158, 11, 0.08),
    rgba(239, 68, 68, 0.04)
  ) !important;
  border: 1px solid rgba(245, 158, 11, 0.25) !important;
  border-radius: 12px;
}
.banner-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  flex-wrap: wrap;
  gap: 4px;
}
.banner-row:hover {
  background: rgba(148, 163, 184, 0.04);
}
.banner-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: rgb(var(--v-theme-on-surface));
}
.banner-detail {
  padding: 4px 16px 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}
.alert-section {
  margin-top: 10px;
}
.alert-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  color: rgb(var(--v-theme-on-surface));
  margin-bottom: 4px;
}
.alert-list {
  list-style: none;
  padding-left: 0;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
  color: rgb(148, 163, 184);
}
.alert-list li {
  padding: 2px 0;
}
.alert-list .font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.days-tag {
  margin-left: 6px;
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 4px;
}
.days-tag--expired {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
}
.see-all {
  display: inline-block;
  font-size: 0.78rem;
  margin-top: 4px;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}
.see-all:hover {
  text-decoration: underline;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
