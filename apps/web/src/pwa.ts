/**
 * PWA-обвязка: регистрация service worker'а.
 *
 * Кнопки «Установить» здесь нет: устанавливать предлагает сам браузер, как
 * только выполнены критерии (манифест + service worker + HTTPS) — рисовать
 * свою кнопку значило бы вводить элемент интерфейса, которого нет ни на
 * Android, ни на Windows (SPEC §1.3, platform parity). `beforeinstallprompt`
 * мы не перехватываем.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}
