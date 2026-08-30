/**
 * Сборка десктопной оболочки.
 *
 * `clearScreen: false` и фиксированный `server.port` — обычные требования
 * `tauri dev` (Tauri сам держит вывод cargo в терминале и стучится в
 * заранее известный порт, см. `src-tauri/tauri.conf.json` → `build.devUrl`).
 * Здесь эта настройка ничего не проверяет и не собирается в этом
 * контейнере (нет системных webkit-библиотек — см. отчёт по пакету работ),
 * но должна остаться корректной для CI, где Tauri действительно доступен.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2023',
  },
});
