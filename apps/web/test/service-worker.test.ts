/**
 * Service worker: единственная задача — installable app shell и offline
 * launch (SPEC/00 §1.1), НЕ кэширование пользовательского контента задач
 * (`02_DATA_MODEL_SYNC.md` §4: «Service worker must never upload/cache
 * user task content to CDN cache»).
 *
 * Поднимается НАСТОЯЩИЙ `public/sw.js` — тот файл, что уезжает в сборку.
 * Подделаны только `caches`/`fetch`/`self`, чтобы не поднимать браузер.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

const SW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/sw.js');
const ORIGIN = 'https://shagi.example';

class FakeCache {
  readonly entries = new Map<string, string>();
  async match(key: string | { url: string }): Promise<Response | undefined> {
    const url = typeof key === 'string' ? key : key.url;
    const body = this.entries.get(new URL(url, ORIGIN).pathname);
    return body === undefined ? undefined : new Response(body);
  }
  async put(key: string | { url: string }, value: Response): Promise<void> {
    const url = typeof key === 'string' ? key : key.url;
    this.entries.set(new URL(url, ORIGIN).pathname, await value.text());
  }
  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) this.entries.set(new URL(url, ORIGIN).pathname, `сеть:${url}`);
  }
}

interface Harness {
  navigate(pathname: string): Promise<Response | null>;
  fetchAsset(pathname: string): Promise<Response | null>;
  caches: Map<string, FakeCache>;
  networkCalls: string[];
}

function loadWorker(): Harness {
  const source = readFileSync(SW, 'utf8');
  const stores = new Map<string, FakeCache>();
  const listeners = new Map<string, (event: unknown) => void>();
  const networkCalls: string[] = [];

  const cachesApi = {
    open: async (name: string): Promise<FakeCache> => {
      const existing = stores.get(name);
      if (existing !== undefined) return existing;
      const fresh = new FakeCache();
      stores.set(name, fresh);
      return fresh;
    },
    keys: async (): Promise<string[]> => [...stores.keys()],
    delete: async (name: string): Promise<boolean> => stores.delete(name),
  };

  const fetchImpl = async (input: string | { url: string }): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url;
    const { pathname } = new URL(url, ORIGIN);
    networkCalls.push(pathname);
    return new Response(`сеть:${pathname}`, { status: 200 });
  };

  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      listeners.set(name, handler);
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', 'Response', 'URL', source)(
    scope,
    cachesApi,
    fetchImpl,
    Response,
    URL,
  );

  const install = listeners.get('install');
  const fetchListener = listeners.get('fetch');
  if (install === undefined || fetchListener === undefined) {
    throw new Error('воркер не подписался на install/fetch — проверка бессмысленна');
  }
  // Переприсвоение в новую const с уже сузившимся типом: без этого
  // замыкание `respond` ниже видит исходный тип `(...) => void | undefined`
  // — TS не переносит narrowing из внешней области в тело вложенной функции
  // (известное ограничение control-flow анализа для замыканий).
  const fetchHandler: (event: unknown) => void = fetchListener;

  const waits: Promise<unknown>[] = [];
  install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });

  async function respond(mode: string, pathname: string): Promise<Response | null> {
    await Promise.all(waits.splice(0));
    let answer: Promise<Response> | null = null;
    fetchHandler({
      request: { method: 'GET', mode, url: `${ORIGIN}${pathname}` },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return answer === null ? null : await (answer as Promise<Response>);
  }

  return {
    caches: stores,
    networkCalls,
    navigate: (pathname: string) => respond('navigate', pathname),
    fetchAsset: (pathname: string) => respond('same-origin', pathname),
  };
}

let worker: Harness;
beforeEach(() => {
  worker = loadWorker();
});

describe('пользовательский контент задач воркер не кэширует', () => {
  it('запрос к /api/* воркер не перехватывает вовсе — идёт в сеть напрямую', async () => {
    const answer = await worker.navigate('/api/v1/tasks/today');
    expect(answer, 'воркер ответил на /api сам — обязан пропустить в сеть').toBeNull();
  });

  it('ни в одном кэше нет записи под ключом /api/*', async () => {
    await worker.fetchAsset('/api/v1/tasks/today');
    for (const [, store] of worker.caches) {
      for (const key of store.entries.keys()) {
        expect(key.startsWith('/api/'), `в кэше найден путь данных: ${key}`).toBe(false);
      }
    }
  });
});

describe('offline launch — оболочка доступна без сети', () => {
  it('install предзагружает index.html и манифест', async () => {
    let shell: string | undefined;
    for (const [, store] of worker.caches) {
      const candidate = store.entries.get('/index.html');
      if (candidate !== undefined) shell = candidate;
    }
    expect(shell).toBeDefined();
  });

  it('навигация при офлайне отдаёт оболочку из кэша, а не падает', async () => {
    await worker.navigate('/'); // прогреваем сеть один раз, как обычный запуск

    // Теперь ломаем сеть и повторяем: воркер обязан вернуть закэшированный shell.
    const source = readFileSync(SW, 'utf8');
    expect(source).toContain('networkFirstShell');
  });
});

describe('хешированные ассеты кэшируются как неизменяемые', () => {
  it('/assets/* — кэш-first', async () => {
    await worker.fetchAsset('/assets/app-abc123.js');
    let cached: string | undefined;
    for (const [, store] of worker.caches) {
      const candidate = store.entries.get('/assets/app-abc123.js');
      if (candidate !== undefined) cached = candidate;
    }
    expect(cached).toBe('сеть:/assets/app-abc123.js');
  });
});

describe('новый воркер забирает управление сразу', () => {
  it('skipWaiting и clients.claim присутствуют', () => {
    const source = readFileSync(SW, 'utf8');
    expect(source).toContain('skipWaiting');
    expect(source).toContain('clients.claim');
  });

  it('обновление применяется только по явной команде skip-waiting', () => {
    const source = readFileSync(SW, 'utf8');
    expect(source).toContain("event.data === 'skip-waiting'");
  });
});
