import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],server:{port:5188,proxy:{'/api':process.env.WAREHOUSE_API_URL||'http://127.0.0.1:3088'}},build:{outDir:'dist'}});
