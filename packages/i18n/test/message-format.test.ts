import { describe, expect, it } from 'vitest';

import { MessageFormatError, formatMessage } from '../src/message-format.js';

const RU = 'ru-RU';

describe('message-format: ICU-lite', () => {
  it('простая подстановка параметра', () => {
    expect(formatMessage('Привет, {name}!', { name: 'Илья' }, RU)).toBe('Привет, Илья!');
  });

  it('числовой параметр форматируется через Intl.NumberFormat (разделитель тысяч)', () => {
    expect(formatMessage('Всего: {count}', { count: 12345 }, RU)).toBe('Всего: 12 345');
  });

  it('точное совпадение "=N" внутри плюрала имеет приоритет над общей категорией', () => {
    const source =
      '{count, plural, =0 {Нет задач} one {# задача} few {# задачи} many {# задач} other {# задачи}}';
    expect(formatMessage(source, { count: 0 }, RU)).toBe('Нет задач');
    expect(formatMessage(source, { count: 1 }, RU)).toBe('1 задача');
  });

  it('ICU-квотирование апострофом экранирует {, } и #', () => {
    expect(formatMessage("Буквально: '{не аргумент}'", {}, RU)).toBe('Буквально: {не аргумент}');
    expect(formatMessage("Решётка: '#'", {}, RU)).toBe('Решётка: #');
    expect(formatMessage("Апостроф: ''", {}, RU)).toBe("Апостроф: '");
  });

  it('# вне ветки плюрала остаётся буквальным символом', () => {
    expect(formatMessage('Тег #важное', {}, RU)).toBe('Тег #важное');
  });

  it('падает с внятной ошибкой на несбалансированных скобках', () => {
    expect(() => formatMessage('Незакрытая {скобка', {}, RU)).toThrow(MessageFormatError);
  });

  it('падает с внятной ошибкой на неизвестном типе аргумента ICU', () => {
    expect(() =>
      formatMessage('{count, selectordinal, one {#-й} other {#-й}}', { count: 1 }, RU),
    ).toThrow(/selectordinal/);
  });

  it('падает, если параметр плюрала — не число', () => {
    expect(() =>
      formatMessage(
        '{count, plural, one {#} other {#}}',
        { count: 'много' as unknown as number },
        RU,
      ),
    ).toThrow(MessageFormatError);
  });

  it('падает, если не хватает обычного параметра', () => {
    expect(() => formatMessage('Привет, {name}!', {}, RU)).toThrow(/name/);
  });
});
