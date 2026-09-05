#!/usr/bin/env bash
#
# Обёртка дымового теста для job `smoke` (`.github/workflows/build-android.yml`).
#
# Почему это отдельный файл, а не несколько строк в YAML: шаг `script:` у
# `reactivecircus/android-emulator-runner` исполняет КАЖДУЮ СТРОКУ отдельным
# `sh -c` — переменные между строками не переживают, `set -e` не переживает
# тоже. Проверено логом прогона: `sh -c apk="$(find ...)"`, следом отдельный
# `sh -c [ -n "${apk}" ] ...` — и `${apk}` там уже пустая. Поэтому в YAML
# остаётся ровно одна строка, вызывающая этот скрипт, а вся логика живёт
# здесь, где её ещё и видно целиком.
set -euo pipefail

# adbd рутом — не «на всякий случай», а условие воспроизводимости.
#
# Два механизма смоука доступны только привилегированному adbd, и оба
# отказали в реальных прогонах, когда он поднялся обычным shell (uid 2000):
#   * `kill <pid>` процесса приложения — `Operation not permitted`
#     (прогоны `33926204464` и его rerun);
#   * `am broadcast -a android.intent.action.BOOT_COMPLETED` — это
#     protected broadcast, `SecurityException: not allowed to send broadcast
#     … from uid=2000` (прогон `33938844775`, Step 6c).
# Раньше те же шаги проходили — значит adbd поднимался рутом сам, и прогон
# зависел от везения. Образ `google_apis` (не `google_play`) это позволяет
# штатно, поэтому запрашиваем явно и печатаем, что ответила система.
#
# Провал здесь НЕ фатален: смоук продолжается, и шаги, которым root нужен,
# падают своими прежними осмысленными сообщениями — «нет прав» не должно
# молча превращаться в «функция сломана».
echo "── adbd: запрашиваем root (нужен для kill процесса и protected broadcast) ──"
adb root || true
adb wait-for-device
echo "adb: $(adb shell id -u 2>/dev/null || echo '?') (0 — root, 2000 — shell)"

apk="$(find emulator-apk -name '*.apk' -type f | head -1)"
if [ -z "${apk}" ]; then
  echo '::error::APK для эмулятора не скачался: в каталоге emulator-apk нет ни одного .apk' >&2
  ls -la emulator-apk || true
  exit 1
fi
echo "APK: ${apk} ($(stat -c%s "${apk}") байт)"

id="$(node -p "require('./apps/mobile/src-tauri/tauri.conf.json').identifier")"
echo "applicationId: ${id}"

# logcat снимается ЗДЕСЬ, пока эмулятор ещё жив: после выхода из шага его уже
# нет вместе со всеми логами, а когда приложение падает на старте,
# единственный ответ «почему» — там.
if ! SHAGI_APPLICATION_ID="${id}" node apps/mobile/scripts/android-smoke.mjs "${apk}"; then
  # 400 строк, а не 2000: столько же полезного, а разбирать вывод прогона
  # реально возможно — двухтысячный хвост системного шума прятал в себе
  # собственное сообщение теста.
  echo '── logcat (последние строки) ──'
  adb logcat -d -t 400 || true
  exit 1
fi
