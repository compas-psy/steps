/**
 * Нейтрализация формул в CSV (`06 §6`, фикстура «formula-injection CSV»).
 *
 * Ячейка, начинающаяся с `=`, `+`, `-`, `@`, а также с табуляции или
 * возврата каретки, в Excel/Numbers/LibreOffice трактуется как ФОРМУЛА.
 * Опасность двусторонняя, и обе стороны закрываются здесь:
 *
 * - на ИМПОРТЕ такой текст мы кладём в заголовок или описание задачи как
 *   есть — он безвреден внутри приложения, но станет исполняемым, как
 *   только человек выгрузит эти задачи обратно в CSV;
 * - на ЭКСПОРТЕ мы отдаём файл, который откроют в табличном редакторе.
 *
 * Поэтому нейтрализуем на границе ВЫВОДА (экспорт CSV), а не на входе:
 * портить импортируемый текст нельзя — «No mapped content silently lost»
 * (`06 §6`), заголовок задачи «-5 градусов» обязан остаться собой.
 * Приём — префикс `'` (одинарная кавычка), общепринятый способ сказать
 * табличному редактору «это текст»; при обратном импорте `unescape` его
 * снимает, поэтому круг замыкается без потерь.
 */

const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCsvFormula(value: string): string {
  const first = value.charAt(0);
  if (first === '' || !DANGEROUS_PREFIXES.includes(first)) return value;
  return `'${value}`;
}

export function unescapeCsvFormula(value: string): string {
  if (!value.startsWith("'")) return value;
  const rest = value.slice(1);
  const first = rest.charAt(0);
  if (first === '' || !DANGEROUS_PREFIXES.includes(first)) return value;
  return rest;
}

/** Сериализация одной ячейки CSV: экранирование кавычек + защита формул. */
export function formatCsvCell(value: string): string {
  const safe = escapeCsvFormula(value);
  if (/[",\r\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}
