/**
 * Шлюз production-подписи Android: единственное место, где проверяется
 * ветвление «когда сборка производственная», «что делать при половине
 * секретов», «совпал ли отпечаток» и «что делать, пока боевого ключа ещё
 * нет». Заимствовано у соседнего продукта `compas-psy/zapiski` — разбор в
 * `.ultraplan/research/04-android-release.md`.
 *
 * ── Почему проверки здесь ───────────────────────────────────────────────────
 *
 * В YAML эти правила не испытать: там нет ни функций, ни входов. Здесь они
 * лежат чистыми функциями и прогоняются на выдуманных, но точных входах —
 * без секретов, без Android SDK и без устройства (в этом контейнере его и
 * нет). Настоящий отпечаток настоящего APK так не проверить — это делает шаг
 * `verify` в самом `.github/workflows/build-android.yml` на живом ключе.
 * Здесь проверяется правило, а не артефакт.
 */
import { describe, expect, it } from 'vitest';

import {
  aabName,
  artifactName,
  bundleName,
  checkAabName,
  checkArtifactName,
  checkReleaseTag,
  expectedSignerGate,
  expectedSignerFromKeytool,
  normalizeFingerprint,
  parseApksignerVerify,
  parseExpectedSigner,
  parsePermissionList,
  patchBackNavigation,
  patchManifestPermissions,
  permissionsFromAapt,
  permissionsGate,
  provenance,
  publishGate,
  releaseTag,
  resolveChannel,
  signingPolicy,
  verifySigner,
} from '../scripts/android-release-gate.mjs';

const ALL_SECRETS = {
  ANDROID_KEYSTORE_BASE64: true,
  ANDROID_KEYSTORE_PASSWORD: true,
  ANDROID_KEY_ALIAS: true,
  ANDROID_KEY_PASSWORD: true,
};

/** Вывод `apksigner verify --verbose --print-certs` — по форме настоящего. */
function apksignerOutput({
  dn = 'CN=SHAGI, OU=compas-psy, O=SIMPAS',
  sha256 = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  v1 = true,
  v2 = true,
  v3 = true,
} = {}): string {
  return [
    'Verifies',
    `Verified using v1 scheme (JAR signing): ${v1}`,
    `Verified using v2 scheme (APK Signature Scheme v2): ${v2}`,
    `Verified using v3 scheme (APK Signature Scheme v3): ${v3}`,
    'Verified using v4 scheme (APK Signature Scheme v4): false',
    'Number of signers: 1',
    `Signer #1 certificate DN: ${dn}`,
    `Signer #1 certificate SHA-256 digest: ${sha256}`,
  ].join('\n');
}

const OURS = normalizeFingerprint(
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
);
const THEIRS = normalizeFingerprint('00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF');

describe('канал сборки решается в одном месте', () => {
  it('тег — всегда production', () => {
    expect(resolveChannel({ refType: 'tag', refName: 'shagi-v0.2.0', eventName: 'push' })).toBe(
      'production',
    );
  });

  it('пуш в ветку по умолчанию — production', () => {
    expect(resolveChannel({ refName: 'main', defaultBranch: 'main', eventName: 'push' })).toBe(
      'production',
    );
  });

  it('чужая ветка и pull request — development', () => {
    expect(resolveChannel({ refName: 'feature/x', defaultBranch: 'main', eventName: 'push' })).toBe(
      'development',
    );
    expect(resolveChannel({ refName: 'feature/x', eventName: 'pull_request' })).toBe('development');
  });

  it('ручной запуск производственным не становится сам — только явным выбором', () => {
    expect(
      resolveChannel({ eventName: 'workflow_dispatch', refName: 'main', defaultBranch: 'main' }),
    ).toBe('development');
    expect(resolveChannel({ eventName: 'workflow_dispatch', inputChannel: 'production' })).toBe(
      'production',
    );
  });
});

describe('комплект секретов проверяется целиком', () => {
  it('production + полный комплект — релизная сборка', () => {
    const policy = signingPolicy({ channel: 'production', present: ALL_SECRETS });
    expect(policy.error).toBeNull();
    expect(policy.buildType).toBe('release');
    expect(policy.signed).toBe(true);
  });

  it('production без секретов — отказ, а не debug', () => {
    const policy = signingPolicy({ channel: 'production', present: {} });
    expect(policy.buildType).toBeNull();
    expect(policy.error, 'production без ключа обязан падать').toBeTruthy();
  });

  it('половина комплекта — отказ на ЛЮБОМ канале', () => {
    const half = { ANDROID_KEYSTORE_BASE64: true, ANDROID_KEY_ALIAS: true };
    for (const channel of ['production', 'development']) {
      const policy = signingPolicy({ channel, present: half });
      expect(policy.error, `${channel}: половина комплекта прошла как норма`).toBeTruthy();
      expect(policy.buildType, `${channel}: собрали хоть что-то вместо отказа`).toBeNull();
      // Сообщение обязано называть недостающее поимённо: человек читает его в
      // логе сборки и должен сразу знать, какой секрет заводить. Проверяем
      // смысл, а не формулировку — иначе тест ломается от правки текста.
      for (const missing of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_PASSWORD']) {
        expect(policy.error, `${channel}: не назван недостающий ${missing}`).toContain(missing);
      }
      expect(policy.error, `${channel}: назван как недостающий уже заданный секрет`).not.toContain(
        'Не заданы: ANDROID_KEYSTORE_BASE64',
      );
    }
  });

  it('development без секретов — debug допустим', () => {
    const policy = signingPolicy({ channel: 'development', present: {} });
    expect(policy.error).toBeNull();
    expect(policy.buildType).toBe('debug');
    expect(policy.signed).toBe(false);
  });
});

describe('готовый APK проверяется, а не намерение', () => {
  it('свой ключ, схемы v2 и v3 — выпуск разрешён', () => {
    const outcome = verifySigner({ apksignerOutput: apksignerOutput(), expectedSha256: OURS });
    expect(outcome.problems).toEqual([]);
    expect(outcome.verified).toBe(true);
    expect(outcome.actualSha256).toBe(OURS);
  });

  it('отладочный сертификат — жёсткий отказ', () => {
    const outcome = verifySigner({
      apksignerOutput: apksignerOutput({ dn: 'CN=Android Debug, O=Android, C=US' }),
      expectedSha256: OURS,
    });
    expect(outcome.verified).toBe(false);
    expect(outcome.debugSigned).toBe(true);
    expect(outcome.problems.join(' ')).toContain('отладочным ключом');
  });

  it('отпечаток APK не совпал с ожидаемым — жёсткий отказ', () => {
    const outcome = verifySigner({
      apksignerOutput: apksignerOutput({ sha256: '00:11:22:33' }),
      expectedSha256: OURS,
    });
    expect(outcome.verified).toBe(false);
    expect(outcome.problems.join(' ')).toContain('не совпал');
  });

  it('apksigner упал — отказ, даже если текст выглядит правильным', () => {
    const outcome = verifySigner({
      apksignerOutput: apksignerOutput(),
      expectedSha256: OURS,
      exitCode: 1,
    });
    expect(outcome.verified).toBe(false);
  });

  it('без схемы v2 выпуск не проходит, без v3 — только предупреждение', () => {
    const withoutV2 = verifySigner({
      apksignerOutput: apksignerOutput({ v2: false }),
      expectedSha256: OURS,
    });
    expect(withoutV2.verified).toBe(false);

    const withoutV3 = verifySigner({
      apksignerOutput: apksignerOutput({ v3: false }),
      expectedSha256: OURS,
    });
    expect(withoutV3.verified).toBe(true);
    expect(withoutV3.warnings.join(' ')).toContain('v3');
  });

  it('пустой вывод не считается успехом', () => {
    expect(verifySigner({ apksignerOutput: '', expectedSha256: OURS }).verified).toBe(false);
  });

  it('отпечаток keytool и apksigner приводятся к одному виду', () => {
    const keytool = 'Certificate fingerprints:\n\t SHA256: AA:BB:CC:DD\n';
    expect(expectedSignerFromKeytool(keytool)).toBe('aabbccdd');
    expect(parseApksignerVerify(apksignerOutput()).signers[0]?.sha256).toBe(OURS);
  });
});

describe('EXPECTED_SIGNER.txt — контрольная точка смены ключа', () => {
  const UNFILLED = [
    '# отпечаток ключа подписи',
    '# заполняется после scripts/make-android-keystore.sh',
    '',
  ].join('\n');
  const FILLED = `# отпечаток ключа подписи\n${OURS}\n`;

  it('парсер отличает пустой (только комментарии) файл от заполненного', () => {
    expect(parseExpectedSigner(UNFILLED)).toBe('');
    expect(parseExpectedSigner(FILLED)).toBe(OURS);
    // Формат отпечатка в файле не обязан совпадать с форматом keytool —
    // сверяется нормализованное значение.
    expect(parseExpectedSigner(`# шапка\nAA:BB\n`)).toBe('aabb');
  });

  it('development не смотрит в файл вовсе — ключа ещё может не быть', () => {
    const outcome = expectedSignerGate({
      channel: 'development',
      repoText: UNFILLED,
      keystoreFingerprint: '',
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.blocking).toBe(false);
  });

  it('production + незаполненный файл — понятный отказ, а не молчаливый debug', () => {
    const outcome = expectedSignerGate({
      channel: 'production',
      repoText: UNFILLED,
      keystoreFingerprint: OURS,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.blocking).toBe(true);
    expect(outcome.problems.join(' ')).toContain('make-android-keystore.sh');
  });

  it('production + заполненный файл + совпадение — сборка разрешена', () => {
    const outcome = expectedSignerGate({
      channel: 'production',
      repoText: FILLED,
      keystoreFingerprint: OURS,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.fingerprint).toBe(OURS);
    expect(outcome.problems).toEqual([]);
  });

  it('production + заполненный файл + расхождение — отказ, не предупреждение', () => {
    const outcome = expectedSignerGate({
      channel: 'production',
      repoText: FILLED,
      keystoreFingerprint: THEIRS,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.blocking).toBe(true);
    expect(outcome.problems.join(' ')).toContain('разошёлся');
  });
});

describe('имена сборок — правило СИМПАС', () => {
  it('имя файла: simpas-<продукт>-<версия>.apk, без хеша и номера прогона', () => {
    expect(artifactName({ product: 'shagi', version: '0.1.0' })).toBe('simpas-shagi-0.1.0.apk');
    expect(artifactName({ product: 'shagi', version: '0.1.0', debug: true })).toBe(
      'simpas-shagi-0.1.0-debug.apk',
    );
  });

  it('тег релиза: <продукт>-v<версия>', () => {
    expect(releaseTag({ product: 'shagi', version: '0.1.0' })).toBe('shagi-v0.1.0');
  });

  it('имя связки артефактов отличается от имени файла — в неё едет и паспорт сборки', () => {
    expect(bundleName({ product: 'shagi', version: '0.1.0' })).toBe('simpas-shagi-android-0.1.0');
    expect(bundleName({ product: 'shagi', version: '0.1.0', debug: true })).toBe(
      'simpas-shagi-android-0.1.0-debug',
    );
  });

  it('проверка ловит опечатку в имени артефакта', () => {
    const verdict = checkArtifactName('shagi-0.1.0.apk', { version: '0.1.0' });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toContain('simpas-shagi-0.1.0.apk');
  });

  it('проверка ловит тег, не совпавший с версией из tauri.conf.json', () => {
    const verdict = checkReleaseTag('shagi-v0.2.0', { version: '0.1.0' });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toContain('shagi-v0.1.0');
  });

  it('верное имя и верный тег проходят без замечаний', () => {
    expect(checkArtifactName('simpas-shagi-0.1.0.apk', { version: '0.1.0' }).ok).toBe(true);
    expect(checkReleaseTag('shagi-v0.1.0', { version: '0.1.0' }).ok).toBe(true);
  });
});

describe('разрешения собранного APK сверяются со списком в обе стороны', () => {
  const allowed = parsePermissionList(
    [
      'android.permission.VIBRATE',
      '  # хэптика',
      'android.permission.POST_NOTIFICATIONS',
      '  # локальные напоминания',
    ].join('\n'),
  );

  it('совпадение — без замечаний', () => {
    const outcome = permissionsGate(
      ['android.permission.VIBRATE', 'android.permission.POST_NOTIFICATIONS'],
      allowed,
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.problems).toEqual([]);
  });

  it('лишнее разрешение в пакете (напр. AD_ID из чужой зависимости) — отказ', () => {
    const outcome = permissionsGate(
      [
        'android.permission.VIBRATE',
        'android.permission.POST_NOTIFICATIONS',
        'com.google.android.gms.permission.AD_ID',
      ],
      allowed,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.problems.join(' ')).toContain('AD_ID');
  });

  it('пропавшее из пакета разрешение (список устарел) — тоже отказ', () => {
    const outcome = permissionsGate(['android.permission.VIBRATE'], allowed);
    expect(outcome.ok).toBe(false);
    expect(outcome.problems.join(' ')).toContain('POST_NOTIFICATIONS');
  });

  it('разбор вывода aapt2 dump permissions', () => {
    const dump = [
      'package: ru.cmpas.shagi',
      "uses-permission: name='android.permission.VIBRATE'",
      "uses-permission: name='android.permission.POST_NOTIFICATIONS'",
    ].join('\n');
    expect(permissionsFromAapt(dump)).toEqual([
      'android.permission.VIBRATE',
      'android.permission.POST_NOTIFICATIONS',
    ]);
  });
});

describe('patchManifestPermissions — недостающие разрешения в сгенерированном манифесте', () => {
  // Реальная структура сгенерированного `tauri android init` манифеста
  // (снято CI-прогоном при разборе INTERNET/DYNAMIC_RECEIVER — см. заголовок
  // android-permissions.txt) сокращена до того, что трогает патч: опорная
  // строка INTERNET и закрывающий тег.
  const TAURI_TEMPLATE_MANIFEST = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
    '    package="ru.cmpas.shagi">',
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '',
    '    <!-- AndroidTV support -->',
    '    <uses-feature',
    '        android:name="android.software.leanback"',
    '        android:required="false" />',
    '',
    '    <application></application>',
    '</manifest>',
  ].join('\n');

  it('добавляет разрешения из allowlist, которых ещё нет в манифесте', () => {
    const { text, added } = patchManifestPermissions(TAURI_TEMPLATE_MANIFEST, [
      'android.permission.INTERNET',
      'android.permission.VIBRATE',
      'android.permission.POST_NOTIFICATIONS',
    ]);
    expect(added).toEqual(['android.permission.VIBRATE', 'android.permission.POST_NOTIFICATIONS']);
    expect(text).toContain('<uses-permission android:name="android.permission.VIBRATE" />');
    expect(text).toContain(
      '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    );
    // Порядок: сразу после INTERNET, до остального манифеста — вставка не
    // трогает ничего, что уже там было.
    expect(text.indexOf('VIBRATE')).toBeLessThan(text.indexOf('AndroidTV support'));
  });

  it('не трогает файл вовсе, если добавлять нечего', () => {
    const { text, added } = patchManifestPermissions(TAURI_TEMPLATE_MANIFEST, [
      'android.permission.INTERNET',
    ]);
    expect(added).toEqual([]);
    expect(text).toBe(TAURI_TEMPLATE_MANIFEST);
  });

  it('не дублирует DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION — его добавляет androidx.core при слиянии', () => {
    const { text, added } = patchManifestPermissions(TAURI_TEMPLATE_MANIFEST, [
      'android.permission.INTERNET',
      'ru.cmpas.shagi.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    ]);
    expect(added).toEqual([]);
    expect(text).not.toContain('DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION');
  });

  it('падает с понятной ошибкой, если шаблон Tauri больше не содержит опорной строки INTERNET', () => {
    expect(() =>
      patchManifestPermissions('<manifest></manifest>', ['android.permission.VIBRATE']),
    ).toThrow(/INTERNET/);
  });
});

describe('пользовательский канал открывается только проверенной сборке', () => {
  it('сборка чужой ветки не создаёт GitHub Release, даже если бы прошла проверку', () => {
    expect(publishGate({ channel: 'development', verifiedRelease: true })).toBe(false);
  });

  it('тег без пройденной проверки не публикуется', () => {
    expect(publishGate({ channel: 'production', verifiedRelease: false })).toBe(false);
    expect(publishGate({ channel: 'production', verifiedRelease: true })).toBe(true);
  });
});

describe('паспорт сборки', () => {
  it('несёт обе суммы, applicationId ШАГОВ и честно называет тип сборки', () => {
    const body = provenance({
      channel: 'production',
      version: '0.1.0',
      applicationId: 'ru.cmpas.shagi',
      sourceRef: 'shagi-v0.1.0',
      sourceSha: 'abc',
      apkSha256: 'DE:AD:BE:EF',
      signerSha256: OURS,
      buildType: 'release',
      builtAt: '2026-08-30T12:00:00.000Z',
    });
    expect(body.application_id).toBe('ru.cmpas.shagi');
    expect(body.apk_sha256).toBe('deadbeef');
    expect(body.signer_certificate_sha256).toBe(OURS);
    expect(body.debug_signed).toBe(false);
    /* Ни паролей, ни keystore: паспорт ездит рядом с APK и попадает в релиз. */
    expect(JSON.stringify(body)).not.toMatch(/password|keystore|base64/i);
  });

  it('у debug-сборки честно стоит debug_signed', () => {
    expect(provenance({ buildType: 'debug' } as never).debug_signed).toBe(true);
  });
});

/**
 * AAB — второй распространяемый артефакт релиза (шаг 3 критического пути
 * `MVP 1.0-local`, ADR-0009): Google Play принимает только его, APK
 * остаётся для прямой установки мимо магазина.
 *
 * Имя считается тем же правилом СИМПАС, что и у APK, — здесь проверяется
 * именно это, потому что разъехавшиеся имена ловятся только глазами, а
 * `--clobber` в релизном шаге затрёт файл с неверным именем молча.
 */
describe('имя AAB — по тому же правилу СИМПАС, что и APK', () => {
  it('считается из версии и отличается от APK только расширением', () => {
    expect(aabName({ version: '0.1.0' })).toBe('simpas-shagi-0.1.0.aab');
    expect(aabName({ version: '0.1.0' }).replace(/\.aab$/, '.apk')).toBe(
      artifactName({ version: '0.1.0' }),
    );
  });

  it('у AAB нет debug-варианта: магазин принимает только release', () => {
    // Утверждение проверяется ТИПАМИ, а не значением: попытка попросить
    // отладочный bundle не должна компилироваться вовсе. `@ts-expect-error`
    // сам падает, если ошибки не будет, — то есть тест покраснеет и когда
    // кто-то добавит `debug` в сигнатуру.
    // @ts-expect-error — отладочного bundle не существует: отгружать его некуда
    expect(aabName({ version: '0.1.0', debug: true })).toBe('simpas-shagi-0.1.0.aab');
  });

  it('чужое имя отклоняется с объяснением', () => {
    const verdict = checkAabName('app-release.aab', { version: '0.1.0' });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join(' ')).toContain('simpas-shagi-0.1.0.aab');
  });

  it('правильное имя принимается', () => {
    expect(checkAabName('simpas-shagi-0.1.0.aab', { version: '0.1.0' }).ok).toBe(true);
  });
});

describe('patchBackNavigation — системная «Назад» в страницу, а не в активность', () => {
  // Шаблон `tauri android init` в чистом виде: класс без тела. Второй
  // вариант — с телом — берётся с настоящего примера Tauri (`examples/api`),
  // где в `MainActivity` уже есть `onCreate` с `enableEdgeToEdge()`. Патч
  // обязан работать на обоих: какой именно шаблон приедет в CI, решает
  // версия Tauri, а не мы.
  const WITHOUT_BODY = [
    'package ru.cmpas.shagi',
    '',
    'class MainActivity : TauriActivity()',
    '',
  ].join('\n');
  const WITH_BODY = [
    'package ru.cmpas.shagi',
    '',
    'import android.os.Bundle',
    'import androidx.activity.enableEdgeToEdge',
    '',
    'class MainActivity : TauriActivity() {',
    '  override fun onCreate(savedInstanceState: Bundle?) {',
    '    enableEdgeToEdge()',
    '    super.onCreate(savedInstanceState)',
    '  }',
    '}',
    '',
  ].join('\n');

  it('объявляет handleBackNavigation = true, когда у класса нет тела', () => {
    const { text, patched } = patchBackNavigation(WITHOUT_BODY);
    expect(patched).toBe(true);
    expect(text).toContain('override val handleBackNavigation: Boolean = true');
    // Тело создано, а не приписано снаружи класса: без этого Kotlin не
    // соберётся, а проверка «строка есть в файле» прошла бы и так.
    expect(text).toContain('class MainActivity : TauriActivity() {');
    expect(text.trimEnd().endsWith('}')).toBe(true);
  });

  it('вставляет override в существующее тело, не теряя onCreate', () => {
    const { text, patched } = patchBackNavigation(WITH_BODY);
    expect(patched).toBe(true);
    expect(text).toContain('override val handleBackNavigation: Boolean = true');
    // Главное в этом случае — что патч НИЧЕГО не выбросил: `enableEdgeToEdge`
    // отвечает за безопасные зоны, и потерять его значило бы починить «Назад»
    // ценой раскладки под вырезом.
    expect(text).toContain('enableEdgeToEdge()');
    expect(text).toContain('super.onCreate(savedInstanceState)');
  });

  it('идемпотентен: второй прогон ничего не меняет', () => {
    const once = patchBackNavigation(WITHOUT_BODY);
    const twice = patchBackNavigation(once.text);
    expect(twice.patched).toBe(false);
    expect(twice.text).toBe(once.text);
  });

  it('бросает, если опорного объявления нет', () => {
    // Тихий no-op здесь уже стоил семнадцати минут эмулятора (прогон
    // 33963943918): замена не сработала, никто не узнал, сборка поехала
    // дальше. Поэтому — исключение, а не «вернуть как было».
    expect(() =>
      patchBackNavigation('package ru.cmpas.shagi\n\nclass Other : Something()\n'),
    ).toThrow(/class MainActivity : TauriActivity\(\)/);
  });
});
