/**
 * Единственная локальная идентичность приложения — `ownerScope` (кому
 * принадлежит задача) и `deviceId` (тай-брейк HLC, `@shagi/core hlc.ts`).
 *
 * --- Почему этот файл появился --------------------------------------------
 *
 * До него в `packages/app` было ПЯТЬ отдельных копий `getLocalIdentity()`
 * (`FirstTask`, `QuickAdd`, `ProjectDetail`, `TaskDetail`, `Completed`),
 * каждая с собственным `let cachedLocalIdentity` на уровне модуля. Это
 * значило две вещи, и обе — порча данных, а не стилистическая претензия:
 *
 * 1. Задача, заведённая в онбординге, и задача, заведённая через Quick Add,
 *    получали РАЗНЫЕ `ownerScope` — в одном и том же локальном профиле, на
 *    одном устройстве.
 * 2. `deviceId` менялся при каждом запуске приложения, хотя его контракт
 *    прямо обратный (`identity/uuid-v7.ts`: «создаётся один раз при первой
 *    установке и затем хранится персистентно»). Тай-брейк HLC, построенный
 *    на значении, которое меняется само по себе, не тай-брейк.
 *
 * Сегодня это не видно глазом: `@shagi/storage` пишет `owner_scope`, но ни
 * один запрос по нему не фильтрует. Ровно поэтому дефект и дожил досюда.
 * Он становится фатальным в тот момент, когда появляется аккаунт и sync —
 * то есть в следующем эпике.
 *
 * --- Где это хранится ------------------------------------------------------
 *
 * `localStorage` с защитным `try/catch` — тот же приём и то же обоснование,
 * что у черновика Quick Add (`QuickAdd.tsx`, блок «Draft safety»): в
 * приватном режиме или при заблокированном хранилище обращение бросает.
 * Правильный адрес этих значений — `LocalPreferencesPort`
 * (`@shagi/platform`), но он доступен только через `useHost()`, то есть
 * внутри дерева React, а идентичность нужна и в обработчиках, вызываемых
 * до/вне рендера. Когда придёт эпик аккаунта, ЭТОТ файл — единственное
 * место, которое придётся заменить на порт.
 *
 * Потеря хранилища (`catch`) не роняет продукт: идентичность выродится в
 * сессионную, ровно как было раньше, но задача всё равно создастся.
 */
import { generateDeviceId, generateUuidV7, type Uuid } from '@shagi/core';

const OWNER_SCOPE_KEY = 'shagi:identity:ownerScope';
const DEVICE_ID_KEY = 'shagi:identity:deviceId';

export interface LocalIdentity {
  readonly ownerScope: Uuid;
  readonly deviceId: Uuid;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // См. заголовок: потеря хранилища вырождает идентичность в сессионную,
    // но не мешает создать задачу.
  }
}

/** UUID-строка, а не любой мусор из хранилища: подменённое/испорченное
 * значение обязано быть отброшено, а не пролезть в доменную сущность. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadOrCreate(key: string, create: () => Uuid): Uuid {
  const stored = readStored(key);
  if (stored !== null && UUID_PATTERN.test(stored)) return stored as Uuid;
  const created = create();
  writeStored(key, created);
  return created;
}

let cached: LocalIdentity | null = null;

/**
 * `ownerScope` и `deviceId` — две ОТДЕЛЬНЫЕ генерации, не одно значение с
 * двумя именами: у `deviceId` роль «это конкретное устройство» переживёт
 * будущий вход в аккаунт с несколькими устройствами на одном профиле, а у
 * `ownerScope` — роль «эта задача принадлежит вот этому профилю».
 */
export function getLocalIdentity(): LocalIdentity {
  cached ??= {
    ownerScope: loadOrCreate(OWNER_SCOPE_KEY, generateUuidV7),
    deviceId: loadOrCreate(DEVICE_ID_KEY, generateDeviceId),
  };
  return cached;
}

/** Только для тестов: сбрасывает кэш модуля, чтобы следующий вызов снова
 * прочитал хранилище. Продуктовый код кэш не сбрасывает — идентичность за
 * время работы приложения не меняется. */
export function resetLocalIdentityCacheForTests(): void {
  cached = null;
}
