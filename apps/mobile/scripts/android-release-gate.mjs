#!/usr/bin/env node
/**
 * Шлюз production-подписи Android: что можно выкладывать людям, а что нельзя.
 *
 * ── Зачем ───────────────────────────────────────────────────────────────────
 *
 * Заимствовано у соседнего продукта `compas-psy/zapiski` — разбор в
 * `.ultraplan/research/04-android-release.md`. У Записок сборка когда-то
 * работала fail-open: нет секрета подписи — не падаем, а берём ОТЛАДОЧНЫЙ
 * ключ, собираем `--debug` и кладём результат туда же, куда обычно кладут
 * релиз. Т.е. публичный канал мог отдать пакет, подписанный
 * `CN=Android Debug`, — ровно то, на что Play Защита реагирует в первую
 * очередь. Здесь эта дорога вырезана: половина или ноль секретов на
 * production — отказ ДО получаса компиляции, а не тихий debug.
 *
 * ── Почему логика здесь, а не в YAML ────────────────────────────────────────
 *
 * В YAML её нельзя проверить. Правила «когда сборка производственная», «что
 * делать при половине секретов» и «совпал ли отпечаток» — это ветвления, а
 * ветвления надо испытывать, а не перечитывать глазами. Здесь они лежат
 * чистыми функциями, и `test/android-release-gate.test.ts` прогоняет их без
 * единого секрета и без Android SDK.
 *
 * Секретов этот файл не видит: ему сообщают ЕСТЬ или НЕТ, а не значения.
 *
 * ── Чем ШАГИ отличаются от Записок (и почему тут нет части их шагов) ────────
 *
 * У ШАГОВ в R1 нет сервера вообще — ни бэкенда, ни статики, ни SSH-хоста.
 * Поэтому из схемы Записок сюда сознательно НЕ перенесены:
 *   - выкладка APK по SSH на сервер продукта;
 *   - фид автообновления `latest.json`;
 *   - постоянная ссылка вида `/updates/latest/<продукт>.apk`.
 * Единственная дорога наружу — артефакт прогона GitHub Actions (для любого
 * канала) и GitHub Release по тегу (только для production, только для
 * проверенной release-сборки). Как только у ШАГОВ появится сервер (R1b и
 * позже, вместе с аккаунтом — SPEC/00 §9), эти шаги возвращаются на свои
 * места, а не дописываются с нуля — здесь и в `build-android.yml` для них
 * специально оставлены явные комментарии, а не тихие пробелы.
 *
 * Также у ШАГОВ нет App Links (нет аккаунта, нет входа по ссылке из письма
 * — незачем и `assetlinks.json`). `EXPECTED_SIGNER.txt` здесь всё равно
 * нужен, но по другой причине: он делает смену ключа подписи ГРОМКОЙ —
 * см. `expectedSignerGate` ниже и комментарий в самом файле.
 *
 * Запуск из workflow:
 *   node scripts/android-release-gate.mjs channel
 *   node scripts/android-release-gate.mjs policy
 *   node scripts/android-release-gate.mjs expected-signer --channel <канал> --keystore-fingerprint <sha> --file <путь>
 *   node scripts/android-release-gate.mjs verify --expected <sha> --output <файл>
 *   node scripts/android-release-gate.mjs permissions --list <файл> --dump <файл>
 *   node scripts/android-release-gate.mjs names --version <версия> --print
 *   node scripts/android-release-gate.mjs provenance --out <файл> …
 */

/** Отпечаток к одному виду: строчные шестнадцатеричные без двоеточий. */
export function normalizeFingerprint(value) {
  return String(value ?? '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toLowerCase();
}

/**
 * Канал сборки. ОДНО место, где это решается.
 *
 * Ручной запуск производственным не становится сам: production — это
 * opt-in, иначе достаточно случайно выбрать не ту ветку или галочку.
 */
export function resolveChannel({
  refType = 'branch',
  refName = '',
  defaultBranch = '',
  eventName = 'push',
  inputChannel = '',
} = {}) {
  if (refType === 'tag') return 'production';
  if (eventName === 'workflow_dispatch') {
    return inputChannel === 'production' ? 'production' : 'development';
  }
  if (eventName === 'push' && refName !== '' && refName === defaultBranch) return 'production';
  return 'development';
}

const SECRET_NAMES = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

/**
 * Что делать с этим комплектом секретов.
 *
 * Три состояния и ровно три исхода:
 *   все четыре            → релизная подпись;
 *   ни одного             → development собирает debug, production падает;
 *   часть                 → падаем ВСЕГДА, на любом канале.
 *
 * Последнее — не педантизм. Половина комплекта означает, что кто-то заводил
 * подпись и не довёл; молча собрать debug в этом случае значит спрятать
 * ошибку конфигурации именно там, где её дороже всего не заметить.
 */
export function signingPolicy({ channel = 'development', present = {} } = {}) {
  const missing = SECRET_NAMES.filter((name) => present[name] !== true);
  if (missing.length === 0) {
    return { buildType: 'release', signed: true, error: null };
  }
  if (missing.length < SECRET_NAMES.length) {
    return {
      buildType: null,
      signed: false,
      error:
        'Комплект секретов подписи неполон — это ошибка настройки, а не повод ' +
        'собрать что-нибудь, поэтому падаем на любом канале. Нужны все четыре: ' +
        `${SECRET_NAMES.join(', ')}. Не заданы: ${missing.join(', ')}.`,
    };
  }
  if (channel === 'production') {
    return {
      buildType: null,
      signed: false,
      error:
        'Производственная сборка без ключа подписи невозможна. ' +
        `Нужны все четыре секрета: ${SECRET_NAMES.join(', ')}.`,
    };
  }
  return { buildType: 'debug', signed: false, error: null };
}

/** Отпечаток сертификата из `keytool -list -v`. */
export function expectedSignerFromKeytool(text) {
  const match = /SHA256:\s*([0-9A-Fa-f:]+)/.exec(String(text ?? ''));
  return match ? normalizeFingerprint(match[1]) : '';
}

/**
 * Разбор `apps/mobile/EXPECTED_SIGNER.txt`.
 *
 * Формат — как у `android-permissions.txt`: строки-комментарии (`#`) плюс
 * ровно одна незакомментированная строка с отпечатком. Пока такой строки
 * нет — ключ ещё не создан (см. `expectedSignerGate`).
 */
export function parseExpectedSigner(text) {
  const line = String(text ?? '')
    .split('\n')
    .map((raw) => raw.trim())
    .find((trimmed) => trimmed !== '' && !trimmed.startsWith('#'));
  return line === undefined ? '' : normalizeFingerprint(line);
}

/**
 * Личность ключа подписи против `apps/mobile/EXPECTED_SIGNER.txt`.
 *
 * Ключа при первом запуске этого пакета работ ещё нет — его создаёт
 * владелец продукта вручную (`scripts/make-android-keystore.sh`). Три
 * состояния:
 *
 *   development, любое содержимое файла → ворота не действуют вовсе:
 *     development подписывает постоянным ОТЛАДОЧНЫМ ключом
 *     (`apps/mobile/keys/README.md`) и к боевому ключу отношения не имеет.
 *
 *   production, файл пуст (только комментарии) → отказ с понятным
 *     сообщением «ключ ещё не создан» — это ОЖИДАЕМОЕ и безопасное
 *     состояние на старте продукта, не авария.
 *
 *   production, файл заполнен → сверяется с отпечатком, который реально
 *     лежит в keystore из секретов. Расхождение — отказ, а не
 *     предупреждение: смена ключа обязана быть громкой. У Записок та же
 *     сверка защищает App Links; здесь App Links нет (нет аккаунта — нет
 *     входа по ссылке из письма), но подпись остаётся личностью
 *     приложения — молча принять чужой ключ означает молча сменить эту
 *     личность для всех, кто уже поставил ШАГИ.
 */
export function expectedSignerGate({
  channel = 'development',
  repoText = '',
  keystoreFingerprint = '',
} = {}) {
  if (channel !== 'production') {
    return {
      ok: true,
      blocking: false,
      fingerprint: normalizeFingerprint(keystoreFingerprint),
      problems: [],
    };
  }

  const repoFingerprint = parseExpectedSigner(repoText);
  if (repoFingerprint === '') {
    return {
      ok: false,
      blocking: true,
      fingerprint: '',
      problems: [
        'Ключ подписи ещё не создан: apps/mobile/EXPECTED_SIGNER.txt пуст (только комментарии). ' +
          'Выполните scripts/make-android-keystore.sh, впишите напечатанный им отпечаток SHA-256 ' +
          'единственной незакомментированной строкой в этот файл и заведите четыре секрета ' +
          `${SECRET_NAMES.join(', ')}.`,
      ],
    };
  }

  const actual = normalizeFingerprint(keystoreFingerprint);
  if (actual === '') {
    return {
      ok: false,
      blocking: true,
      fingerprint: '',
      problems: [
        'не удалось прочитать отпечаток из keystore — сверять EXPECTED_SIGNER.txt не с чем',
      ],
    };
  }

  if (repoFingerprint !== actual) {
    return {
      ok: false,
      blocking: true,
      fingerprint: actual,
      problems: [
        `Отпечаток ключа подписи разошёлся с apps/mobile/EXPECTED_SIGNER.txt: keystore ${actual}, ` +
          `файл ${repoFingerprint}. Если ключ сменён сознательно — обновите EXPECTED_SIGNER.txt тем же ` +
          'коммитом, где сменились секреты ANDROID_*. Если нет — секрет ANDROID_KEYSTORE_BASE64 указывает ' +
          'не на тот ключ, и производственную сборку продолжать нельзя: смена ключа обязана быть громкой.',
      ],
    };
  }

  return { ok: true, blocking: false, fingerprint: actual, problems: [] };
}

/**
 * Разбор `apksigner verify --verbose --print-certs`.
 *
 * Имена полей взяты из настоящего вывода инструмента, а не из головы —
 * тот же разбор унаследован от рабочего конвейера Записок.
 */
export function parseApksignerVerify(text) {
  const output = String(text ?? '');
  const scheme = (version) => {
    const found = new RegExp(
      `Verified using v${version} scheme[^\\n]*?:\\s*(true|false)`,
      'i',
    ).exec(output);
    return found ? found[1].toLowerCase() === 'true' : false;
  };
  const signers = [];
  for (const line of output.split('\n')) {
    const dn = /certificate DN:\s*(.+)$/i.exec(line.trim());
    if (dn) signers.push({ dn: dn[1].trim(), sha256: '' });
    const digest = /certificate SHA-256 digest:\s*([0-9A-Fa-f:]+)/i.exec(line.trim());
    if (digest) {
      const value = normalizeFingerprint(digest[1]);
      if (signers.length === 0) signers.push({ dn: '', sha256: value });
      else signers[signers.length - 1].sha256 = value;
    }
  }
  return {
    verifies: /^Verifies\s*$/m.test(output),
    schemes: { v1: scheme(1), v2: scheme(2), v3: scheme(3), v4: scheme(4) },
    signers,
  };
}

/**
 * Годится ли готовый APK для людей.
 *
 * Проверяется ГОТОВЫЙ файл, а не намерение: «keystore восстановился» и «APK
 * подписан этим ключом» — разные утверждения.
 */
export function verifySigner({ apksignerOutput = '', expectedSha256 = '', exitCode = 0 } = {}) {
  const problems = [];
  const report = parseApksignerVerify(apksignerOutput);
  const expected = normalizeFingerprint(expectedSha256);

  if (exitCode !== 0) problems.push(`apksigner verify завершился кодом ${exitCode}`);
  if (!report.verifies) problems.push('apksigner не подтвердил подпись (нет строки «Verifies»)');
  if (report.signers.length === 0) problems.push('в выводе apksigner нет ни одного подписанта');

  const debugSigner = report.signers.find((signer) => /CN=Android Debug/i.test(signer.dn));
  if (debugSigner) problems.push(`APK подписан отладочным ключом: ${debugSigner.dn}`);

  const actual = report.signers.find((signer) => signer.sha256 !== '')?.sha256 ?? '';
  if (expected === '') problems.push('не задан ожидаемый отпечаток из keystore');
  else if (actual === '') problems.push('в выводе apksigner нет отпечатка сертификата');
  else if (actual !== expected) {
    problems.push(`отпечаток APK ${actual} не совпал с ключом ${expected}`);
  }

  /* v2 обязательна: без неё пакет проверяется только по JAR-подписи, а это
     схема, от которой Android уходит с API 24. v3 желательна — она позволяет
     когда-нибудь сменить ключ без переустановки, и её отсутствие не повод
     останавливать выпуск. */
  if (!report.schemes.v2) problems.push('APK Signature Scheme v2 не подтверждена');
  const warnings = report.schemes.v3 ? [] : ['APK Signature Scheme v3 не подтверждена'];

  return {
    verified: problems.length === 0,
    actualSha256: actual,
    expectedSha256: expected,
    schemes: report.schemes,
    debugSigned: Boolean(debugSigner),
    problems,
    warnings,
  };
}

/**
 * Разбор `android-permissions.txt` — списка разрешений в репозитории.
 *
 * Формат намеренно бедный: имя, необязательный `maxSdkVersion=N`, и
 * объяснение комментарием на следующих строках. Ни JSON, ни YAML: файл читают
 * глазами в обзоре, и чем меньше в нём синтаксиса, тем труднее протащить туда
 * лишнее незаметно.
 *
 * Объяснение обязательно (`why`). Разрешение без причины — это разрешение,
 * которое никто и никогда не пересмотрит.
 */
export function parsePermissionList(text) {
  const entries = [];
  let current = null;

  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (line === '') continue;

    if (line.startsWith('#')) {
      // Комментарий после имени — объяснение к нему. Комментарий до первого
      // имени — шапка файла, к разрешениям отношения не имеет.
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
    const max = rest
      .map((token) => /^maxSdkVersion=(\d+)$/.exec(token))
      .find((match) => match !== null);
    current = { name, why: '' };
    if (max?.[1] !== undefined) current.maxSdkVersion = Number(max[1]);
    entries.push(current);
  }

  return entries;
}

/**
 * Сверка разрешений ГОТОВОГО пакета со списком.
 *
 * Расхождение в обе стороны — отказ. Лишнее в пакете очевидно: именно так
 * приезжает разрешение из чужой зависимости (напр. `AD_ID` из аналитики,
 * которой у ШАГОВ в R1 нет вовсе). Но и недостающее — тоже отказ: список,
 * который описывает не тот пакет, что собрался, перестаёт быть источником
 * истины и начинает успокаивать вместо того, чтобы стеречь.
 *
 * Порядок и повторы значения не имеют — сравниваются множества.
 */
export function permissionsGate(actual = [], allowed = []) {
  const declared = new Set(allowed.map((entry) => entry.name));
  const found = new Set(actual.filter((name) => typeof name === 'string' && name !== ''));

  const problems = [];
  for (const name of found) {
    if (!declared.has(name)) {
      problems.push(
        `в пакете есть ${name}, которого нет в android-permissions.txt — ` +
          'либо это чужая зависимость, либо разрешение добавили мимо списка',
      );
    }
  }
  for (const name of declared) {
    if (!found.has(name)) {
      problems.push(`в android-permissions.txt объявлен ${name}, но в пакете его нет`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Имена разрешений из вывода `aapt dump permissions` / `aapt2 dump permissions`.
 * Обе утилиты печатают строки вида `uses-permission: name='android.permission.X'`.
 */
export function permissionsFromAapt(text) {
  const names = [];
  for (const match of String(text).matchAll(/uses-permission:\s*name='([^']+)'/g)) {
    if (match[1] !== undefined) names.push(match[1]);
  }
  return names;
}

/**
 * Имена сборок СИМПАС — правило одно на все продукты системы.
 *
 *   Имя файла:         simpas-<продукт>-<версия>.apk
 *   Тег релиза:        <продукт>-v<версия>
 *
 * `<продукт>` — здесь всегда `shagi`. Приставка `simpas` — по имени
 * СИСТЕМЫ, объединяющей продукты, а не по имени одного из них: имя одного
 * продукта на файлах остальных закрепляет ту самую путаницу, из-за которой
 * КОМПАС транслитерируется тремя способами сразу (`kompas`, `compas`,
 * `cmpas`). Разбор целиком — `.ultraplan/research/04-android-release.md` §1
 * и `docs/dev/contributing.md`, «Имена сборок».
 *
 * Ни хеша коммита, ни номера прогона: имя человек видит в загрузках, и
 * `-a3f9c21` ему ничего не сообщает. Релиз соответствует ВЕРСИИ, а не
 * прогону сборки — пересобрали ту же версию, обновили существующий релиз.
 *
 * Правило касается ИМЁН АРТЕФАКТОВ. `applicationId` (`ru.cmpas.shagi`),
 * ключ подписи, домен `cmpas.ru` и организация `compas-psy` не трогаются:
 * смена `applicationId` означала бы для системы ДРУГОЕ приложение —
 * обновление поверх установленного перестало бы работать, у людей оказались
 * бы две иконки.
 *
 * У ШАГОВ нет постоянной ссылки на сервере (`latestPath` у Записок) — в R1
 * сервера нет вовсе, см. шапку файла.
 */
export const PRODUCT = 'shagi';

/** Приставка по имени системы, а не продукта. См. шапку выше. */
const SYSTEM = 'simpas';

export function artifactName({ product = PRODUCT, version = '', debug = false } = {}) {
  return `${SYSTEM}-${product}-${version}${debug ? '-debug' : ''}.apk`;
}

export function releaseTag({ product = PRODUCT, version = '' } = {}) {
  return `${product}-v${version}`;
}

/**
 * Имя связки артефактов прогона.
 *
 * Отличается от имени файла осознанно: в связку едет не только APK, но и
 * паспорт сборки, и расширение `.apk` в её имени было бы неправдой.
 */
export function bundleName({ product = PRODUCT, version = '', debug = false } = {}) {
  return `${SYSTEM}-${product}-android-${version}${debug ? '-debug' : ''}`;
}

function verdict(problems) {
  return { ok: problems.length === 0, problems };
}

export function checkArtifactName(
  name = '',
  { product = PRODUCT, version = '', debug = false } = {},
) {
  const expected = artifactName({ product, version, debug });
  if (name === expected) return verdict([]);
  return verdict([
    `имя артефакта «${name}» не по правилу СИМПАС — ожидалось «${expected}» ` +
      '(simpas-<продукт>-<версия>.apk, без хеша коммита и номера прогона)',
  ]);
}

export function checkReleaseTag(tag = '', { product = PRODUCT, version = '' } = {}) {
  const expected = releaseTag({ product, version });
  if (tag === expected) return verdict([]);
  return verdict([
    `тег релиза «${tag}» не по правилу СИМПАС — ожидался «${expected}» ` +
      '(<продукт>-v<версия>; релиз соответствует версии, а не прогону сборки)',
  ]);
}

/** Можно ли трогать пользовательский канал — здесь: создавать GitHub Release. */
export function publishGate({ channel = 'development', verifiedRelease = false } = {}) {
  return channel === 'production' && verifiedRelease === true;
}

/** Паспорт сборки: что именно уехало людям и чем оно подписано. */
export function provenance({
  channel,
  version,
  applicationId,
  sourceRef,
  sourceSha,
  apkSha256,
  signerSha256,
  buildType,
  builtAt,
}) {
  return {
    schema_version: 1,
    channel,
    application_id: applicationId,
    version,
    source_ref: sourceRef,
    source_sha: sourceSha,
    apk_sha256: normalizeFingerprint(apkSha256),
    signer_certificate_sha256: normalizeFingerprint(signerSha256),
    build_type: buildType,
    debug_signed: buildType !== 'release',
    built_at: builtAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

/** Не захватывает ничего из замыкания — оксlint просит держать её снаружи. */
function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { readFileSync, writeFileSync, appendFileSync } = await import('node:fs');
  const [, , command, ...rest] = process.argv;
  const flag = (name, fallback = '') => {
    const at = rest.indexOf(`--${name}`);
    return at === -1 ? fallback : (rest[at + 1] ?? fallback);
  };
  const has = (name) => rest.includes(`--${name}`);
  const emit = (line) => {
    console.log(line);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
  };

  if (command === 'channel') {
    const channel = resolveChannel({
      refType: process.env.GITHUB_REF_TYPE ?? 'branch',
      refName: process.env.GITHUB_REF_NAME ?? '',
      defaultBranch: process.env.DEFAULT_BRANCH ?? '',
      eventName: process.env.GITHUB_EVENT_NAME ?? 'push',
      inputChannel: process.env.INPUT_CHANNEL ?? '',
    });
    emit(`channel=${channel}`);
    emit(`promoted=${channel === 'production' ? 'true' : 'false'}`);
  } else if (command === 'policy') {
    const present = Object.fromEntries(
      SECRET_NAMES.map((name) => [name, (process.env[`HAS_${name}`] ?? '') === 'true']),
    );
    const channel = process.env.CHANNEL ?? 'development';
    const policy = signingPolicy({ channel, present });
    if (policy.error) fail(policy.error);
    emit(`build_type=${policy.buildType}`);
    emit(`signed=${policy.signed ? 'true' : 'false'}`);
    console.log(`Android channel: ${channel}`);
    console.log(`Build type: ${policy.buildType}`);
    console.log(
      `Signing config: ${policy.signed ? 'ANDROID_* complete' : 'нет ключа — только development'}`,
    );
  } else if (command === 'expected-signer') {
    const channel = flag('channel', process.env.CHANNEL ?? 'development');
    const filePath = flag('file', 'apps/mobile/EXPECTED_SIGNER.txt');
    const repoText = readFileSync(filePath, 'utf8');
    const outcome = expectedSignerGate({
      channel,
      repoText,
      keystoreFingerprint: flag('keystore-fingerprint', ''),
    });
    if (!outcome.ok) {
      for (const problem of outcome.problems) console.error(`::error::${problem}`);
      process.exit(1);
    }
    if (outcome.blocking === false && channel === 'production') {
      console.log(`Отпечаток ключа совпал с ${filePath}: ${outcome.fingerprint}`);
    } else {
      console.log(`${channel}: EXPECTED_SIGNER.txt не проверяется на этом канале.`);
    }
  } else if (command === 'verify') {
    const outcome = verifySigner({
      apksignerOutput: readFileSync(flag('output'), 'utf8'),
      expectedSha256: flag('expected', process.env.EXPECTED_SIGNER_SHA256 ?? ''),
      exitCode: Number(flag('exit-code', '0')),
    });
    for (const warning of outcome.warnings) console.log(`::warning::${warning}`);
    if (!outcome.verified) {
      for (const problem of outcome.problems) console.error(`::error::${problem}`);
      emit('verified_release=false');
      console.error('Production publish gate: CLOSED');
      process.exit(1);
    }
    emit(`signer_sha256=${outcome.actualSha256}`);
    emit('verified_release=true');
    console.log(`APK signer SHA-256: ${outcome.actualSha256}`);
    console.log('Signature verification: PASS');
    console.log('Production publish gate: OPEN');
  } else if (command === 'provenance') {
    const target = flag('out', 'shagi-android.json');
    const body = provenance({
      channel: flag('channel', 'development'),
      version: flag('version', '0.0.0'),
      applicationId: flag('application-id', 'ru.cmpas.shagi'),
      sourceRef: process.env.GITHUB_REF_NAME ?? '',
      sourceSha: process.env.GITHUB_SHA ?? '',
      apkSha256: flag('apk-sha256', ''),
      signerSha256: flag('signer-sha256', ''),
      buildType: flag('build-type', 'debug'),
      builtAt: flag('built-at', new Date().toISOString()),
    });
    writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`Паспорт сборки: ${target}`);
    console.log(JSON.stringify(body, null, 2));
  } else if (command === 'names') {
    // Имена артефакта и тега — по правилу СИМПАС. Стережём сборкой, а не
    // памятью: записанное правило забывается, падающая сборка — нет.
    const version = flag('version', '');
    const debug = flag('debug', '') === 'true';

    // `--print`: посчитать имена по версии и отдать их для GITHUB_OUTPUT.
    //
    // Между job имена не ездят. Значение одного из секретов репозитория —
    // само слово «shagi», и GitHub выбрасывает любой output, где оно
    // встретилось: «Skip output 'apk' since it may contain secret». В имени
    // файла оно есть всегда. Поэтому релизный job считает имена заново — тем
    // же расчётом, что и сборочный, а не вторым списанным.
    if (has('print')) {
      if (version === '') fail('--print без --version: печатать нечего');
      emit(`apk=${artifactName({ version, debug })}`);
      emit(`bundle=${bundleName({ version, debug })}`);
      emit(`tag=${releaseTag({ version })}`);
    } else {
      const problems = [...checkArtifactName(flag('artifact', ''), { version, debug }).problems];
      const tag = flag('tag', '');
      if (tag !== '') problems.push(...checkReleaseTag(tag, { version }).problems);
      if (problems.length > 0) fail(problems.join('; '));
      console.log(
        `Имена по правилу СИМПАС: ${flag('artifact', '')}${tag === '' ? '' : ` / ${tag}`}`,
      );
    }
  } else if (command === 'permissions') {
    // Разрешения ГОТОВОГО пакета против списка в репозитории. Шаблон
    // манифеста и итоговый APK — разные вещи: Tauri генерирует манифест
    // сам, и разрешение может приехать из зависимости, которую никто не
    // звал (аналитика в R1 у ШАГОВ отсутствует — если `AD_ID` или Install
    // Referrer всё же появятся в собранном пакете, это и обязано упасть).
    const listPath = flag('list', '');
    const dumpPath = flag('dump', '');
    const allowed = parsePermissionList(readFileSync(listPath, 'utf8'));
    const actual = permissionsFromAapt(readFileSync(dumpPath, 'utf8'));
    const { ok, problems } = permissionsGate(actual, allowed);
    console.log(`В пакете: ${actual.length === 0 ? '(ни одного)' : actual.join(', ')}`);
    console.log(`По списку: ${allowed.map((entry) => entry.name).join(', ')}`);
    if (!ok) fail(problems.join('; '));
    console.log('Разрешения совпали со списком android-permissions.txt');
  } else {
    fail(
      `неизвестная команда «${command ?? ''}»: ` +
        'channel | policy | expected-signer | verify | provenance | names | permissions',
    );
  }
}
