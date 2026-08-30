/**
 * ICU-lite MessageFormat: собственный минимальный движок вместо тяжёлой
 * зависимости (`intl-messageformat`/`@formatjs/*`). Решение осознанное —
 * ТЗ §14 требует обосновывать любую зависимость, а нам нужен ровно один
 * функциональный кусок ICU: простая подстановка `{name}` и `plural` с
 * категориями, которые для `ru-RU` считает `Intl.PluralRules` (уже в
 * платформе, полифилл не нужен). Остальной синтаксис ICU (`select`,
 * `selectordinal`, вложенные `number`/`date` подформаты) каталогу не
 * требуется: числа и даты форматирует отдельный слой `format/`
 * (`Temporal` → `Intl`), а не сам текст сообщения.
 *
 * Поддерживается:
 *  - обычный текст;
 *  - `{argName}` — простая подстановка параметра;
 *  - `{argName, plural, one {…} few {…} many {…} other {…}}` — плюрал,
 *    категория выбирается `Intl.PluralRules(locale).select(value)`;
 *    точное совпадение `=N {…}` внутри веток проверяется раньше общей
 *    категории (стандартное поведение ICU для, например, «нет задач»);
 *  - `#` внутри ветки плюрала — отформатированное `Intl.NumberFormat`
 *    значение того же аргумента;
 *  - ICU-квотирование апострофом: `''` → буквальный `'`, `'{'`/`'}'`/`'#'`
 *    → буквальный символ (уйти от специального смысла скобки/решётки).
 */

export class MessageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageFormatError';
  }
}

export type MessageParams = Readonly<Record<string, string | number>>;

type TextNode = { readonly type: 'text'; readonly value: string };
type HashNode = { readonly type: 'hash' };
type ArgNode = { readonly type: 'arg'; readonly name: string };
type PluralNode = {
  readonly type: 'plural';
  readonly name: string;
  readonly exact: ReadonlyMap<number, readonly MessageNode[]>;
  readonly categories: ReadonlyMap<string, readonly MessageNode[]>;
};

type MessageNode = TextNode | HashNode | ArgNode | PluralNode;

/** Находит `}`, парную открывающей `{` в позиции `start`, игнорируя скобки внутри апострофных квот. */
function extractBalanced(input: string, start: number): { content: string; end: number } {
  let depth = 0;
  let inQuote = false;
  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === "'") {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { content: input.slice(start + 1, i), end: i + 1 };
    }
  }
  throw new MessageFormatError(`несбалансированные фигурные скобки в сообщении: "${input}"`);
}

function parseBranches(source: string): {
  exact: Map<number, readonly MessageNode[]>;
  categories: Map<string, readonly MessageNode[]>;
} {
  const exact = new Map<number, readonly MessageNode[]>();
  const categories = new Map<string, readonly MessageNode[]>();
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i] as string)) i += 1;
    if (i >= source.length) break;
    const categoryStart = i;
    while (i < source.length && source[i] !== '{' && !/\s/.test(source[i] as string)) i += 1;
    const category = source.slice(categoryStart, i);
    if (category.length === 0) {
      throw new MessageFormatError(`ожидалась категория плюрала в "${source}"`);
    }
    while (i < source.length && /\s/.test(source[i] as string)) i += 1;
    if (source[i] !== '{') {
      throw new MessageFormatError(
        `после категории плюрала "${category}" ожидалась "{" в "${source}"`,
      );
    }
    const { content, end } = extractBalanced(source, i);
    const branch = parseMessage(content);
    if (category.startsWith('=')) {
      const value = Number(category.slice(1));
      if (!Number.isFinite(value)) {
        throw new MessageFormatError(`некорректное точное значение плюрала "${category}"`);
      }
      exact.set(value, branch);
    } else {
      categories.set(category, branch);
    }
    i = end;
  }
  return { exact, categories };
}

function parsePlaceholder(content: string): MessageNode {
  const firstComma = content.indexOf(',');
  if (firstComma === -1) {
    const name = content.trim();
    if (name.length === 0) {
      throw new MessageFormatError('пустое имя аргумента в "{}"');
    }
    return { type: 'arg', name };
  }
  const name = content.slice(0, firstComma).trim();
  const rest = content.slice(firstComma + 1);
  const secondComma = rest.indexOf(',');
  if (secondComma === -1) {
    throw new MessageFormatError(`не удалось разобрать тип аргумента для "${name}"`);
  }
  const kind = rest.slice(0, secondComma).trim();
  if (kind !== 'plural') {
    throw new MessageFormatError(
      `тип аргумента ICU "${kind}" не реализован (поддерживается только "plural") — аргумент "${name}"`,
    );
  }
  const { exact, categories } = parseBranches(rest.slice(secondComma + 1));
  return { type: 'plural', name, exact, categories };
}

/** Разбирает шаблон сообщения в дерево узлов. Результат стоит кэшировать — см. `translate.ts`. */
export function parseMessage(input: string): readonly MessageNode[] {
  const nodes: MessageNode[] = [];
  let buffer = '';
  let i = 0;
  const flush = () => {
    if (buffer.length > 0) {
      nodes.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === "'") {
      if (input[i + 1] === "'") {
        buffer += "'";
        i += 2;
        continue;
      }
      let j = i + 1;
      while (j < input.length && input[j] !== "'") j += 1;
      buffer += input.slice(i + 1, j);
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      flush();
      const { content, end } = extractBalanced(input, i);
      nodes.push(parsePlaceholder(content));
      i = end;
      continue;
    }
    if (ch === '#') {
      flush();
      nodes.push({ type: 'hash' });
      i += 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return nodes;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();
function pluralRulesFor(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();
function numberFormatFor(locale: string): Intl.NumberFormat {
  let format = numberFormatCache.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale);
    numberFormatCache.set(locale, format);
  }
  return format;
}

function renderNodes(
  nodes: readonly MessageNode[],
  params: MessageParams | undefined,
  locale: string,
  hashValue: number | undefined,
): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.value;
        break;
      case 'hash':
        if (hashValue === undefined) {
          out += '#';
        } else {
          out += numberFormatFor(locale).format(hashValue);
        }
        break;
      case 'arg': {
        const value = params?.[node.name];
        if (value === undefined) {
          throw new MessageFormatError(`не хватает параметра "${node.name}" для сообщения`);
        }
        out += typeof value === 'number' ? numberFormatFor(locale).format(value) : value;
        break;
      }
      case 'plural': {
        const value = params?.[node.name];
        if (typeof value !== 'number') {
          throw new MessageFormatError(
            `параметр плюрала "${node.name}" должен быть числом, получено: ${JSON.stringify(value)}`,
          );
        }
        const exactBranch = node.exact.get(value);
        const category = pluralRulesFor(locale).select(value);
        const branch = exactBranch ?? node.categories.get(category) ?? node.categories.get('other');
        if (!branch) {
          throw new MessageFormatError(
            `в плюрале "${node.name}" нет ветки "${category}" и нет "other" (locale: ${locale})`,
          );
        }
        out += renderNodes(branch, params, locale, value);
        break;
      }
    }
  }
  return out;
}

/** Разбирает и сразу рендерит шаблон сообщения — удобно для тестов и разовых вызовов вне каталога. */
export function formatMessage(
  source: string,
  params: MessageParams | undefined,
  locale: string,
): string {
  return renderNodes(parseMessage(source), params, locale, undefined);
}

export { renderNodes };
export type { MessageNode };
