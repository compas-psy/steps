#!/usr/bin/env bash
# Генерация иконок ШАГОВ (открытый вопрос ?30 в .ultraplan/open-questions.md).
#
# Источники — только замороженные assets/brand/*.svg, ничего не редактируем.
# rsvg-convert рендерит SVG в PNG заданного размера (точный размер важен:
# растеризация из square PNG 512×512 через downscale размывает мелкие
# favicon, поэтому берём исходный векторный файл, а не готовый .png).
#
# Требуются два системных инструмента, которых нет в чистом контейнере —
# ставились для этой задачи через apt, в комплект поставки репозитория не
# входят:
#   sudo apt-get install -y librsvg2-bin imagemagick
# `librsvg2-bin` даёт `rsvg-convert` (SVG → PNG точного размера);
# `imagemagick` даёт `convert`/`identify` (сборка .ico из нескольких PNG,
# заливка фонового холста сплошным цветом, композиция слоёв для maskable).
# Готовые PNG/ICO закоммичены в apps/*, поэтому сборка и тесты от этих
# утилит НЕ зависят — только перегенерация иконок требует их локально.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRAND="$ROOT/assets/brand"
WEB_ICONS="$ROOT/apps/web/public/icons"
DESKTOP_ICONS="$ROOT/apps/desktop/src-tauri/icons"
MOBILE_ICONS="$ROOT/apps/mobile/src-tauri/icons"

SQUARE="$BRAND/shagi-square.svg"
TRANSPARENT="$BRAND/shagi-transparent.svg"
BRAND_GREEN="#3B8F5A"

mkdir -p "$WEB_ICONS" "$DESKTOP_ICONS" "$MOBILE_ICONS"

render() {
  local src="$1" size="$2" out="$3"
  rsvg-convert -w "$size" -h "$size" "$src" -o "$out"
}

# ── Web (PWA) ────────────────────────────────────────────────────────────
# any — из shagi-square.svg (фирменный фон + скругление уже в источнике,
# решение ?30): OS показывает эту плитку как есть, без своей маски.
render "$SQUARE" 192 "$WEB_ICONS/pwa-192-any.png"
render "$SQUARE" 512 "$WEB_ICONS/pwa-512-any.png"

# maskable — ДРУГАЯ геометрия, не увеличенная копия any (был дефект: файлы
# совпадали побайтово). `purpose: maskable` — обещание системе, что вся
# смысловая часть знака помещается во вписанный круг радиусом 40% стороны
# (W3C: https://www.w3.org/TR/appmanifest/#dfn-safe-zone) — система вправе
# обрезать всё за его пределами под круг/squircle/каплю/скруглённый квадрат.
#
# Фон — сплошной фирменный цвет ВО ВСЮ плитку, без скругления: скругление
# рисует система через маску, своё скругление поверх её маски дало бы двойное
# (и на части масок — тень собственного скругления, видимую как артефакт).
#
# Дерево берём из shagi-transparent.svg (без подложки) и рендерим в размер
# всей плитки БЕЗ дополнительного уменьшения: у самого source уже есть
# встроенный отступ (внутренний `scale(0.74)` в разметке SVG, тот же, что
# и в shagi-square.svg) — замер по альфа-каналу (rsvg-convert 4000×4000 +
# скан пикселей) даёт максимальный радиус чернил ≈0.2343 стороны, это
# заметно меньше требуемых 0.40 (запас ~41% от радиуса безопасной зоны).
# Досжимать дальше незачем — вписывается и так, с большим запасом.
for size in 192 512; do
  bg="$(mktemp).png"
  mark="$(mktemp).png"
  convert -size "${size}x${size}" xc:"$BRAND_GREEN" "$bg"
  render "$TRANSPARENT" "$size" "$mark"
  convert "$bg" "$mark" -gravity center -composite -type TrueColorAlpha -define png:color-type=6 -strip "$WEB_ICONS/pwa-${size}-maskable.png"
  rm -f "$bg" "$mark"
done

render "$SQUARE" 180 "$WEB_ICONS/apple-touch-icon-180.png"
# favicon — из shagi-transparent.svg: без принудительного фона, потому что
# на 16px квадрат с rx=140 и фирменным зелёным читается хуже, чем голая
# отметка на фоне, который и так подставляет браузер (вкладка/закладки).
render "$TRANSPARENT" 32 "$WEB_ICONS/favicon-32.png"
render "$TRANSPARENT" 16 "$WEB_ICONS/favicon-16.png"

# ── Desktop (Tauri bundle.icon) ─────────────────────────────────────────
# Не maskable-поверхность (Windows не режет иконки приложений системной
# маской) — из shagi-square.svg, как и any-иконки веба, без изменений.
render "$SQUARE" 32 "$DESKTOP_ICONS/32x32.png"
render "$SQUARE" 128 "$DESKTOP_ICONS/128x128.png"
render "$SQUARE" 256 "$DESKTOP_ICONS/128x128@2x.png"
render "$SQUARE" 512 "$DESKTOP_ICONS/icon.png"
# .ico — набор 16/32/48/256 в одном файле (решение ?30, только Windows —
# R1 gate не включает macOS, поэтому .icns не собираем, SPEC/00 §1.1/§1.2).
tmpdir=$(mktemp -d)
render "$SQUARE" 16 "$tmpdir/16.png"
render "$SQUARE" 32 "$tmpdir/32.png"
render "$SQUARE" 48 "$tmpdir/48.png"
render "$SQUARE" 256 "$tmpdir/256.png"
convert "$tmpdir/16.png" "$tmpdir/32.png" "$tmpdir/48.png" "$tmpdir/256.png" -strip "$DESKTOP_ICONS/icon.ico"
rm -rf "$tmpdir"

# ── Mobile (Tauri bundle.icon — базовый набор для `tauri icon`/`tauri
#    android init` в CI; полный adaptive-icon комплект Android CI строит из
#    assets/brand/android/ic_launcher_{foreground,background,monochrome}.svg,
#    их здесь не дублируем — источник истины уже в assets/brand/, ?31 всё
#    ещё открытый вопрос про safe zone: см. отчёт по этому пакету работ —
#    та же замерная методика применена и к ic_launcher_foreground.svg) ────
render "$SQUARE" 32 "$MOBILE_ICONS/32x32.png"
render "$SQUARE" 128 "$MOBILE_ICONS/128x128.png"
render "$SQUARE" 256 "$MOBILE_ICONS/128x128@2x.png"
render "$SQUARE" 512 "$MOBILE_ICONS/icon.png"

echo "Готово. Геометрию maskable-иконок проверяет apps/web/test/icons.test.ts (не глазами)."
