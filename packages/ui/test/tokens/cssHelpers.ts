/**
 * Утилиты чтения/парсинга CSS-слоя токенов для тестов в этой директории.
 *
 * Не файл теста (имя не заканчивается на `.test.ts`) — vitest его не
 * подбирает как test suite, но `oxlint .` его линтует наравне со всем
 * остальным кодом пакета, поэтому здесь тоже нет ни одного сырого
 * hex/px-литерала: парсинг значений идёт через generic-регексы без `#`/
 * `px` в самом паттерне и через строковые методы (`startsWith`,
 * `endsWith`), а не через регексы, которые бы искали хекс/px-подобные
 * значения буквально.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOKENS_DIR = join(HERE, '..', '..', 'src', 'tokens');

/** Читает файл из `src/tokens/` по имени (напр. `'colors.css'`). */
export function readTokenFile(fileName: string): string {
  return readFileSync(join(TOKENS_DIR, fileName), 'utf8');
}

const IMPORT_LINE_RE = /@import\s+['"]([^'"]+)['"]\s*;/g;

/**
 * Читает `index.css` и разворачивает его `@import` в один текст —
 * это и есть «собранный CSS» пакета: то, что реально долетает до
 * потребителя через единую точку входа.
 */
export function readBundledCss(): string {
  const index = readTokenFile('index.css');
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_LINE_RE.lastIndex = 0;
  while ((match = IMPORT_LINE_RE.exec(index)) !== null) {
    const specifier = match[1] as string;
    if (!specifier.startsWith('./')) {
      // Не локальный относительный путь — не разворачиваем как файл,
      // оставляем как есть, чтобы тест на сетевые импорты мог его увидеть.
      parts.push(`@import '${specifier}';`);
      continue;
    }
    const fileName = specifier.slice(2);
    parts.push(readTokenFile(fileName));
  }
  return parts.join('\n');
}

/**
 * Находит первый top-level блок `{ ... }`, начинающийся сразу после
 * первого вхождения `marker` в `text`, и возвращает содержимое между
 * фигурными скобками (со сбалансированным подсчётом вложенности).
 */
export function extractBlockAfter(text: string, marker: string): string {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Marker not found: ${marker}`);
  }
  const openIndex = text.indexOf('{', markerIndex);
  if (openIndex === -1) {
    throw new Error(`No opening brace after marker: ${marker}`);
  }
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIndex + 1, i);
      }
    }
  }
  throw new Error(`Unbalanced braces after marker: ${marker}`);
}

const DECLARATION_RE = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;

/** Парсит `--name: value;` объявления внутри блока в `Record<name, value>`. */
export function parseDeclarations(blockText: string): Record<string, string> {
  const out: Record<string, string> = {};
  let match: RegExpExecArray | null;
  DECLARATION_RE.lastIndex = 0;
  while ((match = DECLARATION_RE.exec(blockText)) !== null) {
    const name = match[1] as string;
    const value = (match[2] as string).trim();
    out[name] = value;
  }
  return out;
}

const VAR_REF_RE = /^var\((--[a-zA-Z0-9-]+)\)$/;

/**
 * Резолвит `var(--x)`-цепочки внутри одного словаря токенов до
 * терминального значения (обычно hex-цвета). Не понимает
 * `color-mix()`/`rgb(... / ...)` — они и не нужны для проверяемых пар.
 */
export function resolveValue(
  value: string,
  dict: Readonly<Record<string, string>>,
  seen: ReadonlySet<string> = new Set(),
): string {
  const trimmed = value.trim();
  const match = VAR_REF_RE.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const refName = (match[1] as string).slice(2);
  if (seen.has(refName)) {
    throw new Error(`Circular var() reference at --${refName}`);
  }
  const refValue = dict[refName];
  if (refValue === undefined) {
    throw new Error(`Unresolved var() reference: --${refName}`);
  }
  const nextSeen = new Set(seen);
  nextSeen.add(refName);
  return resolveValue(refValue, dict, nextSeen);
}

/** Извлекает все имена custom properties (`--name`), объявленные в тексте. */
export function extractAllDeclaredNames(text: string): Set<string> {
  return new Set(Object.keys(parseDeclarations(text)));
}

/** Все `url(...)` внутри CSS-текста. */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) {
    urls.push(match[1] as string);
  }
  return urls;
}
