import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRedirecting = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      const path = window.location.pathname;
      if (path !== '/login') {
        isRedirecting = true;
        for (const storage of [localStorage, sessionStorage]) {
          storage.removeItem('token');
          storage.removeItem('saleUser');
        }
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
