/**
 * Сборка мобильной оболочки. `server.host`/`hmr.port` — стандартная нужда
 * `tauri android dev`: эмулятор/устройство стучится в Vite-сервер хоста по
 * сети, а не по `localhost` (сеть недоступна в этом контейнере — Android
 * SDK/NDK нет вовсе, см. отчёт по пакету работ). Значение подхватывается
 * из переменной окружения, которую расставляет сам Tauri CLI при `android
 * dev`; без неё (как здесь, при обычном `vite build`) секция не мешает.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const HOST = process.env['TAURI_DEV_HOST'];

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: HOST ?? false,
    port: 5184,
    strictPort: true,
    ...(HOST !== undefined ? { hmr: { protocol: 'ws' as const, host: HOST, port: 5185 } } : {}),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2023',
  },
});
