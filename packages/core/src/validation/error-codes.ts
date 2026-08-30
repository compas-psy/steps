/**
 * Стабильные коды ошибок валидатора (`03§19`: «stable error code», требуется
 * `02§11.1`). Там, где в перечне `03§19` нашёлся код, подходящий по смыслу —
 * он переиспользован буквально, без переименования. Где не нашёлся — заведён
 * свой в той же форме (`SCREAMING_SNAKE_CASE`, доменное существительное +
 * характер нарушения), а не изобретён обходной синоним существующего кода.
 *
 * Один код может покрывать несколько правил конспекта (например
 * `TEMPORAL_CONFLICT` — правила 1–4 и 32–34): различие между конкретными
 * причинами внутри одного кода несёт `ValidationIssue.rule` (номер правила
 * конспекта) и `ValidationIssue.field`, а не разрастание количества кодов.
 * Разбор по кодам — в отчёте пакета работ E01.3.
 */
export type ValidationErrorCode =
  // --- переиспользованы из `03§19` буквально --------------------------------
  /** Правила 1–4 (блокирующие) и 32–34 (предупреждения) — вся temporal-модель. */
  | 'TEMPORAL_CONFLICT'
  /** Правило 21 — лимит вложений/задачу; название кода в `03§19` уже про
   * квоту вложений, что дословно совпадает с этим правилом. */
  | 'ATTACHMENT_QUOTA_EXCEEDED'
  /** Правила 27 (Free-лимит 10) и 28 (технический потолок 500) — оба про
   * лимит числа проектов, различаются `details.limitType`. */
  | 'PROJECT_LIMIT_REACHED'
  /** Задел на правило 29 (ownership входящей sync-мутации) — код объявлен
   * для будущего использования пакетом `@shagi/sync`, здесь не эмитируется
   * ни одной проверкой (sync-слоя ещё нет, см. `sync-stubs.ts`). */
  | 'PERMISSION_DENIED'
  /** Задел на правила 30/31 (recurrence merge: remove-wins граница и
   * template_revision reconciliation) — код объявлен для будущего движка
   * повторов (эпик E11), здесь не эмитируется (см. `sync-stubs.ts`). */
  | 'SYNC_CONFLICT'
  // --- заведены в этом пакете работ, подходящего кода в `03§19` нет ---------
  /** Правило 5: `section_id` без `project_id`. */
  | 'TASK_SECTION_REQUIRES_PROJECT'
  /** Правило 6: прямой child обязан иметь тот же Project/Section, что и Parent. */
  | 'TASK_HIERARCHY_PROJECT_MISMATCH'
  /** Правило 7 (часть депта): user-created глубина ≤1 — родитель обязан сам
   * быть top-level. */
  | 'TASK_HIERARCHY_DEPTH_EXCEEDED'
  /** Правило 7 (часть цикла): задача не может быть родителем самой себе. */
  | 'TASK_HIERARCHY_CYCLE'
  /** Правило 8: Recurring Task обязана быть top-level; попытка переместить
   * повторяющуюся задачу под другую блокируется, пока повтор не снят. */
  | 'TASK_RECURRING_MUST_BE_TOP_LEVEL'
  /** Правило 9: дочерняя задача не может быть в `inbox`. */
  | 'TASK_CHILD_MUST_BE_PROCESSED'
  /** Правило 10: `focus_date` — null либо строго равен `planned_date`. */
  | 'TASK_FOCUS_DATE_MISMATCH'
  /** Правило 11: `day_bucket=later` требует непустой Planned Date. */
  | 'TASK_DAY_BUCKET_REQUIRES_PLANNED_DATE'
  /** Правило 12: `status=completed` согласован с `completed_at`. */
  | 'TASK_COMPLETION_INCONSISTENT'
  /** Правило 13: `completion_kind` согласован со `status`. */
  | 'TASK_COMPLETION_KIND_INCONSISTENT'
  /** Правило 14 (длина): title 1..500 Unicode-символов после нормализации. */
  | 'TASK_TITLE_LENGTH_INVALID'
  /** Правило 14 (читаемость): после отбрасывания принятых service-токенов не
   * осталось читаемого текста (решение `?10`). */
  | 'TASK_TITLE_NOT_READABLE'
  /** Правило 15: description 0..100 000 символов. */
  | 'TASK_DESCRIPTION_TOO_LONG'
  /** Правило 16: max 100 прямых subtasks на задачу. */
  | 'TASK_SUBTASK_LIMIT_EXCEEDED'
  /** Правило 17: max 200 checklist items на задачу. */
  | 'TASK_CHECKLIST_LIMIT_EXCEEDED'
  /** Правило 18: max 50 labels на задачу. */
  | 'TASK_LABEL_LIMIT_EXCEEDED'
  /** Правило 19: max 1 explicit reminder на задачу (R1 UI). */
  | 'TASK_REMINDER_LIMIT_EXCEEDED'
  /** Правило 20: max 20 links на задачу. */
  | 'TASK_LINK_LIMIT_EXCEEDED'
  /** Правило 25: `duration_min` вне диапазона `[1,1440]`. */
  | 'TASK_DURATION_OUT_OF_RANGE'
  /** Правило 26: `priority` вне диапазона `[1,4]`. */
  | 'TASK_PRIORITY_OUT_OF_RANGE'
  /** Правило 22 (title): Project title вне `1..120`. */
  | 'PROJECT_TITLE_LENGTH_INVALID'
  /** Правило 22 (description): Project description длиннее `10 000`. */
  | 'PROJECT_DESCRIPTION_TOO_LONG'
  /** Правило 23 (Section): title вне `1..80`. */
  | 'SECTION_TITLE_LENGTH_INVALID'
  /** Правило 23 (Label): title вне `1..80`. */
  | 'LABEL_TITLE_LENGTH_INVALID'
  /** Правило 24: метка не уникальна в scope пользователя (регистронезависимо
   * после Unicode-нормализации). */
  | 'LABEL_NOT_UNIQUE';
