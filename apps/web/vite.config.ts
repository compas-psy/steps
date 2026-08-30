/**
 * Сборка веб-оболочки ШАГОВ.
 *
 * Домен/пакеты воркспейса резолвятся в исходники: публичный API всё равно
 * только `src/index.ts` каждого пакета (`docs/dev/contributing.md`,
 * «Границы пакетов»). Явные алиасы здесь не нужны — pnpm-воркспейс уже
 * линкует `@shagi/*` через `exports` в их `package.json`; Vite это понимает
 * из коробки. Конфиг оставлен маленьким намеренно: оболочке нечего
 * собирать, кроме монтирования `@shagi/app`.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'es2023',
  },
});
