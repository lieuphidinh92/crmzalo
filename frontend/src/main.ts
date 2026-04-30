import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index';
import { vuetify } from './plugins/vuetify';
import './assets/main.css';
import './assets/mobile.css';
import { registerSW } from 'virtual:pwa-register';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.mount('#app');

// Service worker registration — only effective on production builds
// because devOptions.enabled is false in vite.config.ts.
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
