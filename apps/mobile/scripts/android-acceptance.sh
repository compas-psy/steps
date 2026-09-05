#!/usr/bin/env bash
#
# Обёртка короткой приёмки для job `acceptance`
# (`.github/workflows/build-android.yml`).
#
# Почему это отдельный файл, а не несколько строк в YAML — та же причина, что
# у `android-smoke.sh`: шаг `script:` у `reactivecircus/android-emulator-runner`
# исполняет КАЖДУЮ СТРОКУ отдельным `sh -c` — переменные между строками не
# переживают, `set -e` не переживает тоже. Проверено логом прогона:
# `sh -c apk="$(find ...)"`, следом отдельный `sh -c [ -n "${apk}" ] ...` — и
# `${apk}` там уже пустая. Поэтому в YAML остаётся ровно одна строка,
# вызывающая этот скрипт, а вся логика живёт здесь, где её ещё и видно целиком.
set -euo pipefail

# `adb root` здесь НЕ запрашивается — в отличие от длинного смоука.
#
# Рута требовали ровно два его механизма: `kill <pid>` чужого процесса и
# protected broadcast `BOOT_COMPLETED`. В коротком сценарии нет ни того, ни
# другого: приложение закрывается штатным `am force-stop`, файл базы снимается
# через `run-as` (он работает под обычным shell для debuggable-сборки).
# Просить привилегию, которая не нужна, — значит завести ещё одну причину
# отказа там, где проверяемое свойство от неё не зависит.
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
if ! SHAGI_APPLICATION_ID="${id}" node apps/mobile/scripts/android-acceptance.mjs "${apk}"; then
  # 400 строк, а не 2000: столько же полезного, а разбирать вывод прогона
  # реально возможно — двухтысячный хвост системного шума прятал в себе
  # собственное сообщение теста.
  echo '── logcat (последние строки) ──'
  adb logcat -d -t 400 || true
  exit 1
fi
