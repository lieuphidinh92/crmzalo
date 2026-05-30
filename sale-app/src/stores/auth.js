import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  function loadFromStorage() {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('saleUser');
    if (t) token.value = t;
    if (u) {
      try {
        user.value = JSON.parse(u);
      } catch {
        user.value = null;
      }
    }
  }

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('saleUser', JSON.stringify(data.user));
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
    localStorage.setItem('saleUser', JSON.stringify(data));
    return data;
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('saleUser');
    window.location.href = '/login';
  }

  return { user, token, isAuthenticated, loadFromStorage, login, fetchProfile, logout };
});
