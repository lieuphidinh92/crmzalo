import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  function clearStoredAuth() {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem('token');
      storage.removeItem('saleUser');
    }
  }

  function currentStorage() {
    return localStorage.getItem('token') ? localStorage : sessionStorage;
  }

  function loadFromStorage() {
    // Ưu tiên phiên được ghi nhớ, fallback sang phiên chỉ sống trong tab/browser hiện tại.
    const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
    const t = storage.getItem('token');
    const u = storage.getItem('saleUser');
    if (t) token.value = t;
    if (u) {
      try {
        user.value = JSON.parse(u);
      } catch {
        user.value = null;
      }
    }
  }

  async function login(email, password, rememberMe = false) {
    const { data } = await api.post('/auth/login', { email, password, rememberMe });
    token.value = data.token;
    user.value = data.user;
    clearStoredAuth();
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('token', data.token);
    storage.setItem('saleUser', JSON.stringify(data.user));
    // Login payload omits fullName — fetch full profile so UI can show it.
    try {
      await fetchProfile();
    } catch {
      // non-fatal; we still have the JWT payload
    }
    return user.value;
  }

  async function fetchProfile() {
    const { data } = await api.get('/profile');
    user.value = data;
    currentStorage().setItem('saleUser', JSON.stringify(data));
    return data;
  }

  function logout() {
    token.value = null;
    user.value = null;
    clearStoredAuth();
    window.location.href = '/login';
  }

  return { user, token, isAuthenticated, loadFromStorage, login, fetchProfile, logout };
});
