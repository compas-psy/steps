/**
 * Барель подкаталога `account/` (пакет работ E03.8 «компоненты
 * аккаунта/данных»: `SignIn`, `OtpInput`, `SyncStatus`, `DataPrivacyRow`,
 * `Entitlement` — `.ultraplan/research/02-ui.md` §2 «Account/Data» и
 * `04_UI_DESIGN_SYSTEM.md` §10 «Account/Data»).
 *
 * Публичный API пакета остаётся единой точкой `packages/ui/src/index.ts` —
 * этот файл туда пока НЕ реэкспортирован намеренно (тот же приём, что
 * `task/index.ts`/`planning/index.ts`/`organization/index.ts`/
 * `capture/index.ts`: сведение барелей в `../index.ts` и в
 * `../../index.ts` — задача оркестратора на приёмке пакета работ, не
 * этого пакета работ, см. их заголовки).
 */

export {
  DataPrivacyRow,
  type DataPrivacyRowAction,
  type DataPrivacyRowProps,
} from './DataPrivacyRow.js';
export { Entitlement, type EntitlementProps, type EntitlementTone } from './Entitlement.js';
export { SignIn, type SignInProps } from './SignIn.js';
export { OtpInput, type OtpInputProps } from './OtpInput.js';
export { SyncStatus, type SyncStatusProps, type SyncStatusValue } from './SyncStatus.js';
