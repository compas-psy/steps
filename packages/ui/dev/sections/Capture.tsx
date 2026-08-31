/**
 * Секция «Capture» харнесса (E03.7) — Composer/DraftIndicator/
 * InheritedContextChip/NLPToken/ParsingPreview/QuickAdd.
 */
import { type ReactElement, useState } from 'react';

import {
  Composer,
  type ComposerMode,
  DraftIndicator,
  InheritedContextChip,
  NLPToken,
  type NLPTokenKind,
  ParsingPreview,
  QuickAdd,
} from '../../src/components/index.js';
import { Example, HarnessSection } from './Example.js';

const NLP_TOKEN_KINDS: readonly { readonly kind: NLPTokenKind; readonly label: string }[] = [
  { kind: 'date', label: '3 сен' },
  { kind: 'weekday', label: 'в среду' },
  { kind: 'time', label: '09:00' },
  { kind: 'deadline', label: 'до 5 сен' },
  { kind: 'duration', label: '30 мин' },
  { kind: 'recurrence', label: 'каждый день' },
  { kind: 'project', label: 'Дом' },
  { kind: 'label', label: 'Срочно' },
  { kind: 'priority', label: 'P1' },
];

function ComposerExample(): ReactElement {
  const [mode, setMode] = useState<ComposerMode>('text');
  return (
    <Example testId="example-composer" label="Текст / Голос / Файл" wide>
      <Composer
        label="Способ добавления задачи"
        mode={mode}
        onModeChange={setMode}
        textLabel="Текст"
        voiceLabel="Голос"
        fileLabel="Файл"
        textIcon="checklist"
        voiceIcon="sync"
        fileIcon="attach"
        fileDisabled
        textSlot={
          <QuickAdd
            value=""
            onChange={() => {}}
            onSubmit={() => {}}
            label="Текст задачи"
            submitLabel="Добавить"
          />
        }
        voiceSlot="Запись голосового сообщения."
        fileSlot="Скоро: прикрепление файла."
      />
    </Example>
  );
}

function QuickAddExamples(): ReactElement {
  const [value, setValue] = useState('Купить билеты завтра в 9');
  return (
    <>
      <Example testId="example-quick-add-default" label="Default" wide>
        <QuickAdd
          value={value}
          onChange={setValue}
          onSubmit={() => {}}
          label="Быстрое добавление задачи"
          submitLabel="Добавить"
          placeholder="Добавить задачу…"
          icon="add"
        />
      </Example>
      <Example testId="example-quick-add-loading" label="Loading" wide>
        <QuickAdd
          value="Отправляется…"
          onChange={() => {}}
          onSubmit={() => {}}
          label="Быстрое добавление задачи"
          submitLabel="Добавить"
          loading
        />
      </Example>
      <Example testId="example-quick-add-error" label="Error" wide>
        <QuickAdd
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
          label="Быстрое добавление задачи"
          submitLabel="Добавить"
          error
          errorMessage="Не удалось распознать дату"
        />
      </Example>
      <Example testId="example-quick-add-disabled" label="Disabled" wide>
        <QuickAdd
          value="Недоступно"
          onChange={() => {}}
          onSubmit={() => {}}
          label="Быстрое добавление задачи"
          submitLabel="Добавить"
          disabled
        />
      </Example>
    </>
  );
}

export function CaptureSection(): ReactElement {
  return (
    <HarnessSection testId="section-capture" title="Capture">
      <ComposerExample />

      <Example testId="example-draft-indicator" label="Есть несохранённый черновик">
        <DraftIndicator label="Есть несохранённый черновик" />
      </Example>

      <Example testId="example-inherited-context-chip" label="Default / Removable">
        <div className="dev-row">
          <InheritedContextChip icon="folder">Дом (унаследовано)</InheritedContextChip>
          <InheritedContextChip icon="folder" removable removeLabel="Убрать" onRemove={() => {}}>
            Дом (унаследовано)
          </InheritedContextChip>
        </div>
      </Example>

      <Example testId="example-nlp-token-kinds" label="Все 9 видов" wide>
        <div className="dev-row">
          {NLP_TOKEN_KINDS.map(({ kind, label }) => (
            <NLPToken key={kind} kind={kind}>
              {label}
            </NLPToken>
          ))}
        </div>
      </Example>

      <Example testId="example-parsing-preview" label="С токенами" wide>
        <ParsingPreview
          title="Купить билеты в среду в 9 утра #Дом"
          label="Предпросмотр разбора"
          tokens={[
            { id: '1', kind: 'weekday', label: 'в среду' },
            { id: '2', kind: 'time', label: '09:00' },
            { id: '3', kind: 'project', label: 'Дом' },
          ]}
        />
      </Example>
      <Example testId="example-parsing-preview-empty" label="Пусто" wide>
        <ParsingPreview
          title=""
          label="Предпросмотр разбора"
          tokens={[]}
          emptyState="Начните вводить текст задачи"
        />
      </Example>

      <QuickAddExamples />
    </HarnessSection>
  );
}
