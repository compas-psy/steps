import { describe, expect, it } from 'vitest';

import { ICON_DEFINITIONS, ICON_NAMES, ICON_REGISTRY } from '../../src/icons/contours.js';

/**
 * «Реестр контуров, а не пятьдесят компонентов» (E03.0) — эти тесты
 * проверяют сам реестр как структуру данных: уникальность имён,
 * отсутствие осиротевших записей, непустоту каждого контура.
 *
 * Массив `ICON_DEFINITIONS` — намеренно массив, а не объект-литерал
 * `{ [name]: ... }`: JS молча схлопывает повторяющийся ключ объекта
 * (последнее определение побеждает без единого предупреждения), и тест
 * на дубликат тогда никогда не сможет покраснеть на настоящей ошибке
 * копипаста. Массив дубликат сохраняет — следующая проверка его ловит.
 */
describe('реестр контуров — уникальность и полнота', () => {
  it('имена иконок уникальны — ни одного повтора в ICON_DEFINITIONS', () => {
    const names = ICON_DEFINITIONS.map((def) => def.name);
    const unique = new Set(names);
    expect(
      unique.size,
      `дубликаты: ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`,
    ).toBe(names.length);
  });

  it('у каждой иконки хотя бы один примитив контура', () => {
    for (const def of ICON_DEFINITIONS) {
      expect(def.primitives.length, `иконка "${def.name}" без контура`).toBeGreaterThan(0);
    }
  });

  it('ICON_NAMES — те же имена и в том же составе, что ICON_DEFINITIONS', () => {
    expect(ICON_NAMES).toEqual(ICON_DEFINITIONS.map((def) => def.name));
  });

  it('ICON_REGISTRY не содержит осиротевших записей: ключи совпадают с ICON_NAMES 1:1', () => {
    const registryKeys = Object.keys(ICON_REGISTRY).toSorted();
    const expectedKeys = [...ICON_NAMES].toSorted();
    expect(registryKeys).toEqual(expectedKeys);
  });

  it('каждая запись ICON_REGISTRY совпадает по контуру со своим определением', () => {
    for (const def of ICON_DEFINITIONS) {
      expect(ICON_REGISTRY[def.name]).toBe(def.primitives);
    }
  });

  it('набор непустой и достаточен для перечня из задания E03.0', () => {
    // Не «сколько угодно», а хотя бы то ядро, что явно требует
    // задание: общие action-иконки + минимум специфичных для
    // задачника глифов (повтор, приоритет, календарь, чек-лист и т.д.).
    const required = [
      'add',
      'search',
      'filter',
      'archive',
      'delete',
      'close',
      'back',
      'more',
      'import',
      'export',
      'attach',
      'list',
      'tags',
      'sync',
      'repeat',
      'priority',
      'calendar',
      'bell',
      'dragHandle',
      'checklist',
      'check',
      'circleIncomplete',
      'clock',
      'duration',
      'deadline',
      'star',
      'folder',
      'section',
      'board',
      'moveToToday',
      'moveToTomorrow',
      'overdue',
    ];
    for (const name of required) {
      expect(ICON_NAMES, `отсутствует обязательная иконка "${name}"`).toContain(name);
    }
  });
});
