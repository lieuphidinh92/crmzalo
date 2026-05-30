import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../components/MainLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('../views/Home.vue') },
      { path: 'pos', name: 'pos', component: () => import('../views/POS.vue'), alias: '/create-order' },
      // Phase 3+ modules — stubbed for now so the 5-tab nav has no dead links.
      { path: 'products', name: 'products', component: () => import('../views/ComingSoon.vue') },
      { path: 'orders', name: 'orders', component: () => import('../views/ComingSoon.vue') },
      { path: 'customers', name: 'customers', component: () => import('../views/ComingSoon.vue') },
      { path: 'inventory', name: 'inventory', component: () => import('../views/ComingSoon.vue') },
      { path: 'promotions', name: 'promotions', component: () => import('../views/ComingSoon.vue') },
      { path: 'reports', name: 'reports', component: () => import('../views/ComingSoon.vue') },
      { path: 'settings', name: 'settings', component: () => import('../views/Settings.vue') },
      { path: 'account', name: 'account', component: () => import('../views/ComingSoon.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!auth.token) auth.loadFromStorage();
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' };
  }
  return true;
});

export default router;
