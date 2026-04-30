import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: localStorage.getItem('theme') || 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background: '#0A1628',
          surface: '#162844',
          'surface-variant': '#1E3458',
          'surface-light': '#2A4775',
          primary: '#F59E0B',
          secondary: '#FBBF24',
          accent: '#F59E0B',
          error: '#EF4444',
          warning: '#F59E0B',
          success: '#10B981',
          info: '#3B82F6',
          'on-background': '#FFFFFF',
          'on-surface': '#FFFFFF',
          'on-primary': '#0A1628',
        },
      },
      light: {
        dark: false,
        colors: {
          background: '#FAF7F0',
          surface: '#FFFFFF',
          'surface-variant': '#F5EFE0',
          primary: '#0A1628',
          secondary: '#162844',
          accent: '#F59E0B',
          error: '#EF4444',
          warning: '#F59E0B',
          success: '#10B981',
          info: '#3B82F6',
        },
      },
    },
  },
  defaults: {
    VBtn: { variant: 'flat', rounded: 'xl' },
    VTextField: { variant: 'outlined', density: 'compact', rounded: 'xl' },
    VSelect: { variant: 'outlined', density: 'compact', rounded: 'xl' },
    VAutocomplete: { variant: 'outlined', density: 'compact', rounded: 'xl' },
    VTextarea: { variant: 'outlined', density: 'compact', rounded: 'xl' },
    VCard: { rounded: 'xl', variant: 'flat' },
    VChip: { rounded: 'lg', size: 'small' },
    VDialog: { maxWidth: 600 },
  },
});
