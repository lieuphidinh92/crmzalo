import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { layout: 'auth' },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/SetupView.vue'),
    meta: { layout: 'auth' },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/contacts',
    name: 'Contacts',
    component: () => import('@/views/ContactsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/zalo-accounts',
    name: 'ZaloAccounts',
    component: () => import('@/views/ZaloAccountsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/appointments',
    redirect: '/tasks',
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('@/views/TasksView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/tasks/learning',
    name: 'Learning',
    component: () => import('@/views/LearningView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings/cadence',
    name: 'CadenceSettings',
    component: () => import('@/views/CadenceSettingsView.vue'),
    meta: { requiresAuth: true, adminOnly: true },
  },
  {
    path: '/orders',
    name: 'Orders',
    component: () => import('@/views/OrdersView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/products',
    name: 'Products',
    component: () => import('@/views/ProductsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/products/:id',
    name: 'ProductDetail',
    component: () => import('@/views/ProductDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/inventory',
    name: 'Inventory',
    component: () => import('@/views/InventoryPlaceholderView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings/brands',
    name: 'BrandSettings',
    component: () => import('@/views/BrandSettingsView.vue'),
    meta: { requiresAuth: true, adminOnly: true },
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/views/ReportsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/reports/overview',
    name: 'OverviewReport',
    component: () => import('@/views/OverviewReportView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/reports/resale',
    name: 'ResaleReport',
    component: () => import('@/views/ResaleReportView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/reports/resale/at-risk',
    name: 'ResaleAtRisk',
    component: () => import('@/views/ResaleAtRiskView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/reports/pipeline',
    name: 'Pipeline',
    component: () => import('@/views/PipelineView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/dashboard/ceo',
    name: 'CeoDashboard',
    component: () => import('@/views/CeoDashboardView.vue'),
    meta: { requiresAuth: true, adminOnly: true },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/jobs',
    name: 'Jobs',
    component: () => import('@/views/JobsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/jobs/:id',
    name: 'JobDetail',
    component: () => import('@/views/JobDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/ai-settings',
    name: 'AISettings',
    component: () => import('@/views/AISettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/more',
    name: 'More',
    component: () => import('@/views/MoreView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/quick-replies',
    name: 'QuickReplies',
    component: () => import('@/views/QuickRepliesView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Auth guard
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Skip guard for setup and login pages
  if (to.name === 'Setup' || to.name === 'Login') {
    return next();
  }

  // Check auth for protected routes
  if (to.meta.requiresAuth) {
    if (!authStore.token) {
      return next('/login');
    }
    // Fetch profile if not loaded yet
    if (!authStore.user) {
      await authStore.init();
      if (!authStore.isAuthenticated) {
        return next('/login');
      }
    }
  }

  next();
});
