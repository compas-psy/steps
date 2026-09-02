/**
 * Разбор CSV — общий для Todoist-экспорта и «обычного» CSV (`01§26`).
 *
 * Свой парсер, а не библиотека: правила здесь не общие, а продуктовые, и
 * каждое из них нужно уметь показать тестом.
 *
 * 1. **Терпимость к лишним колонкам** — прямое требование `01§26`
 *    («Parser tolerant to extra/new columns»). Строка отдаётся как
 *    `Record<заголовок, значение>`: незнакомая колонка не ломает разбор и
 *    не теряется, а короткая строка не превращается в ошибку — недостающие
 *    поля просто пусты.
 * 2. **Кавычки по RFC 4180**: `""` внутри кавычек — одна кавычка, перевод
 *    строки внутри кавычек — часть значения, а не конец записи. Описания
 *    задач Todoist многострочны сплошь и рядом.
 * 3. **BOM** в начале файла снимается: Todoist отдаёт UTF-8 с BOM, и без
 *    этого первый заголовок назывался бы `<BOM>TYPE`.
 * 4. **CRLF/CR/LF** — все три конца строки.
 *
 * Чего парсер НЕ делает: не угадывает разделитель (запятая — формат
 * Todoist), не приводит типы (это забота отображения) и не нейтрализует
 * формулы (`sanitize.ts` — отдельный шаг, у него другой смысл и другое
 * место применения).
 */

/** Одна запись CSV: заголовок → значение. */
export type CsvRow = Readonly<Record<string, string>>;

export interface CsvTable {
  readonly headers: readonly string[];
  readonly rows: readonly CsvRow[];
}

/** Разбор в плоский массив полей по записям — без привязки к заголовкам. */
export function parseCsvRecords(text: string): readonly (readonly string[])[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;
  // Была ли в записи хоть одна ячейка — отличает «пустую строку» (её
  // выбрасываем) от строки из одного пустого поля.
  let touched = false;

  const endField = (): void => {
    record.push(field);
    field = '';
    touched = true;
  };
  const endRecord = (): void => {
    endField();
    // Строка из единственного пустого поля — это пустая строка файла.
    if (record.length > 1 || record[0] !== '') records.push(record);
    record = [];
    touched = false;
  };

  while (index < source.length) {
    const char = source[index] as string;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      endField();
      index += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      endRecord();
      index += char === '\r' && source[index + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += char;
    index += 1;
  }
  if (field !== '' || touched || record.length > 0) endRecord();
  return records;
}

/**
 * Разбор с заголовками. Пустой файл (или файл из одних пустых строк) —
 * НЕ ошибка парсера: он честно возвращает ноль строк, а решение «это не
 * годный файл импорта» принимает уровень выше, где известно, чего ждали.
 */
export function parseCsvTable(text: string): CsvTable {
  const records = parseCsvRecords(text);
  const [header, ...rest] = records;
  if (header === undefined) return { headers: [], rows: [] };
  const headers = header.map((name) => name.trim());
  const rows = rest.map((record) => {
    const row: Record<string, string> = {};
    headers.forEach((name, position) => {
      row[name] = record[position] ?? '';
    });
    return row;
  });
  return { headers, rows };
}
