/**
 * `android-permissions.txt` — единственный источник истины для разрешений
 * Android (решение ?28, `.ultraplan/open-questions.md`; формат — по образцу
 * `compas-psy/zapiski`). Каждая строка обязана иметь объяснение — строка
 * без него не проходит проверку: разрешение без причины — это разрешение,
 * которое никто не пересмотрит. `INTERNET` — в списке (пересмотр ?28): он
 * объявлен самим сгенерированным манифестом Tauri, а не решением продукта —
 * см. объяснение самой строки в файле и `manifest-merger`-доказательство,
 * на которое оно ссылается.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../android-permissions.txt',
);

interface PermissionEntry {
  name: string;
  maxSdkVersion?: number;
  why: string;
}

/**
 * Разбор `android-permissions.txt`: комментарий ДО первого имени — шапка
 * файла (пропускается), комментарий ПОСЛЕ имени — объяснение к нему.
 */
export function parsePermissionList(text: string): PermissionEntry[] {
  const entries: PermissionEntry[] = [];
  let current: PermissionEntry | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;

    if (line.startsWith('#')) {
      if (current !== null) {
        const note = line.replace(/^#\s?/, '').trim();
        if (note !== '') current.why = current.why === '' ? note : `${current.why} ${note}`;
      }
      continue;
    }

    const [name, ...rest] = line.split(/\s+/);
    if (name === undefined || !/^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(name)) {
      throw new Error(`android-permissions.txt: непонятная строка «${line}»`);
    }
    current = { name, why: '' };
    const maxMatch = rest.map((token) => /^maxSdkVersion=(\d+)$/.exec(token)).find(Boolean);
    if (maxMatch?.[1] !== undefined) current.maxSdkVersion = Number(maxMatch[1]);
    entries.push(current);
  }

  return entries;
}

const text = readFileSync(FILE, 'utf8');
const entries = parsePermissionList(text);
const names = entries.map((entry) => entry.name);

describe('parsePermissionList — самопроверка парсера', () => {
  it('шапка файла (комментарий до первого имени) не становится объяснением', () => {
    const parsed = parsePermissionList(
      '# шапка файла\n# ещё шапка\n\nandroid.permission.VIBRATE\n  # объяснение\n',
    );
    expect(parsed).toEqual([{ name: 'android.permission.VIBRATE', why: 'объяснение' }]);
  });

  it('maxSdkVersion разбирается и не путается с объяснением', () => {
    const parsed = parsePermissionList(
      'android.permission.USE_FINGERPRINT maxSdkVersion=28\n  # причина\n',
    );
    expect(parsed[0]?.maxSdkVersion).toBe(28);
  });
});

describe('android-permissions.txt', () => {
  it('файл разобрался и не пуст', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('INTERNET в списке присутствует — объявлен базовым манифестом Tauri, не решением продукта (пересмотр ?28)', () => {
    expect(names).toContain('android.permission.INTERNET');
  });

  it('список — разрешения, решённые для R1 (?28) плюс подтверждённая инфраструктура Tauri/AndroidX', () => {
    // `USE_EXACT_ALARM` намеренно НЕ в списке — Android документирует его
    // с `SCHEDULE_EXACT_ALARM` как взаимоисключающий выбор для одного
    // приложения, не пару «оба сразу» (см. объяснение самой строки
    // `SCHEDULE_EXACT_ALARM` в файле). `INTERNET` — требование сгенерированного
    // базового манифеста Tauri (WebView-мост), не решение продукта.
    // `WAKE_LOCK` — безусловное объявление `tauri-plugin-notification`
    // 2.4.0 (ADR-0008) в его собственном манифесте, найдено CI-шлюзом при
    // Task B2, не решением продукта (см. объяснение самой строки в файле).
    // `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — саморазрешение AndroidX
    // Core (`signature`-уровень, не пользовательское) на СОБРАННЫЙ APK, тоже
    // не решение продукта — тот же список, что фактически проверяет
    // `aapt dump permissions`.
    expect([...names].toSorted()).toEqual(
      [
        'android.permission.INTERNET',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.SCHEDULE_EXACT_ALARM',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
        'android.permission.WAKE_LOCK',
        'ru.cmpas.shagi.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
      ].toSorted(),
    );
  });

  it('у каждого разрешения есть объяснение — пустая строка не проходит', () => {
    for (const entry of entries) {
      expect(entry.why, `${entry.name}: нет объяснения`).toBeTruthy();
      expect(entry.why.length, `${entry.name}: объяснение подозрительно короткое`).toBeGreaterThan(
        10,
      );
    }
  });

  it('строка INTERNET явно проговаривает пересмотр решения и ссылается на manifest-merger как доказательство', () => {
    expect(text).toMatch(/INTERNET/);
    expect(text.toLowerCase()).toMatch(/пересмотрен/);
    expect(text).toMatch(/manifest-merger/);
  });

  it('строка WAKE_LOCK ссылается на исходник tauri-plugin-notification как доказательство', () => {
    expect(text).toMatch(/WAKE_LOCK/);
    expect(text).toMatch(/tauri-plugin-notification/);
    expect(text).toMatch(/AndroidManifest\.xml/);
  });
});
