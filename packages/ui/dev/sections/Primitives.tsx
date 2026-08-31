/**
 * Секция «Primitives» харнесса (E03.1) — Badge/Button/Card/Checkbox/Chip/
 * Divider/Icon/IconButton/Input/Radio/SegmentedControl/ServiceMark/Spinner/
 * Switch/Textarea/Tooltip. Состояния каждого примитива — из JSDoc самих
 * компонентов (`../../src/components/*.tsx`, ссылки на §10/§11 ТЗ), не
 * придуманы заново здесь.
 */
import { type ReactElement, useState } from 'react';

import {
  Badge,
  type BadgeVariant,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  type ChipTone,
  Divider,
  Icon,
  IconButton,
  Input,
  Radio,
  SegmentedControl,
  ServiceMark,
  Spinner,
  Switch,
  Textarea,
  Tooltip,
} from '../../src/components/index.js';
import { ICON_NAMES } from '../../src/icons/index.js';
import { Example, HarnessSection } from './Example.js';

const BADGE_VARIANTS: readonly BadgeVariant[] = [
  'default',
  'secondary',
  'outline',
  'success',
  'pending',
  'info',
  'new',
  'destructive',
];

const CHIP_TONES: readonly ChipTone[] = [
  'neutral',
  'forest',
  'gold',
  'blue',
  'violet',
  'orange',
  'red',
  'success',
];

function ButtonExamples(): ReactElement {
  return (
    <>
      <Example
        testId="example-button-variants"
        label="Variant (primary/accent/secondary/ghost/destructive)"
      >
        <div className="dev-row">
          <Button variant="primary">Сохранить</Button>
          <Button variant="accent">Отметить главным</Button>
          <Button variant="secondary">Отмена</Button>
          <Button variant="ghost">Пропустить</Button>
          <Button variant="destructive">Удалить</Button>
        </div>
      </Example>
      <Example testId="example-button-disabled" label="Disabled">
        <Button disabled>Недоступно</Button>
      </Example>
      <Example testId="example-button-loading" label="Loading">
        <Button loading>Сохранение…</Button>
      </Example>
      <Example testId="example-button-block" label="Block, с иконками">
        <div style={{ width: '100%' }}>
          <Button
            block
            leadingIcon={<Icon name="add" size={16} />}
            trailingIcon={<Icon name="chevron" size={16} />}
          >
            Добавить задачу
          </Button>
        </div>
      </Example>
    </>
  );
}

function InputExamples(): ReactElement {
  const [value, setValue] = useState('Купить билеты');
  return (
    <>
      <Example testId="example-input-default" label="Default">
        <Input
          aria-label="Название задачи"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Название задачи"
          leading={<Icon name="checklist" size={16} />}
        />
      </Example>
      <Example testId="example-input-error" label="Error">
        <Input
          aria-label="Дедлайн"
          defaultValue="32 февраля"
          error
          errorMessage="Такой даты не существует"
        />
      </Example>
      <Example testId="example-input-disabled" label="Disabled">
        <Input aria-label="Заблокированное поле" defaultValue="Недоступно" disabled />
      </Example>
    </>
  );
}

function TextareaExamples(): ReactElement {
  return (
    <>
      <Example testId="example-textarea-default" label="Default">
        <Textarea aria-label="Заметка" defaultValue="Взять с собой зарядку и пропуск." rows={3} />
      </Example>
      <Example testId="example-textarea-error" label="Error">
        <Textarea
          aria-label="Заметка с ошибкой"
          defaultValue=""
          error
          errorMessage="Заметка не может быть пустой"
          rows={3}
        />
      </Example>
      <Example testId="example-textarea-disabled" label="Disabled">
        <Textarea
          aria-label="Заблокированная заметка"
          defaultValue="Недоступно"
          disabled
          rows={3}
        />
      </Example>
    </>
  );
}

function ChipExamples(): ReactElement {
  return (
    <>
      <Example testId="example-chip-default" label="Default (статичный span)">
        <Chip tone="forest" icon="calendar">
          Сегодня
        </Chip>
      </Example>
      <Example testId="example-chip-selected" label="Selected (переключаемая кнопка)">
        <Chip tone="gold" selected onClick={() => {}}>
          Главное
        </Chip>
      </Example>
      <Example testId="example-chip-removable" label="Removable">
        <Chip tone="blue" removable removeLabel="Убрать метку" onRemove={() => {}}>
          Проект «Дом»
        </Chip>
      </Example>
      <Example testId="example-chip-tones" label="Все тона">
        <div className="dev-row">
          {CHIP_TONES.map((tone) => (
            <Chip key={tone} tone={tone}>
              {tone}
            </Chip>
          ))}
        </div>
      </Example>
    </>
  );
}

function SegmentedControlExample(): ReactElement {
  const [value, setValue] = useState('today');
  return (
    <>
      <Example testId="example-segmented-forest" label="Accent forest">
        <SegmentedControl
          label="Вид списка"
          accent="forest"
          value={value}
          onChange={setValue}
          options={[
            { value: 'today', label: 'Сегодня', icon: 'inbox' },
            { value: 'plan', label: 'План', icon: 'calendar' },
            { value: 'board', label: 'Доска', icon: 'board' },
          ]}
        />
      </Example>
      <Example testId="example-segmented-gold" label="Accent gold">
        <SegmentedControl
          label="Приоритет"
          accent="gold"
          value="p1"
          onChange={() => {}}
          options={[
            { value: 'p1', label: 'P1' },
            { value: 'p2', label: 'P2' },
          ]}
        />
      </Example>
    </>
  );
}

function IconGrid(): ReactElement {
  return (
    <Example testId="example-icon-grid" label={`Все иконки реестра (${ICON_NAMES.length})`} wide>
      <div className="dev-icon-grid">
        {ICON_NAMES.map((name) => (
          <div key={name} className="dev-icon-grid__item" data-testid={`icon-${name}`}>
            <Icon name={name} size={22} />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </Example>
  );
}

export function PrimitivesSection(): ReactElement {
  return (
    <HarnessSection testId="section-primitives" title="Primitives">
      <Example testId="example-badge-variants" label="Variant (все 8)">
        <div className="dev-row">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Example>
      <Example testId="example-badge-dot-icon" label="С точкой / с иконкой">
        <div className="dev-row">
          <Badge variant="success" dot>
            Готово
          </Badge>
          <Badge variant="info" icon="sync">
            Синхронизация
          </Badge>
        </div>
      </Example>

      <ButtonExamples />

      <Example testId="example-card-static" label="Static">
        <Card padding="md" style={{ width: 240 }}>
          <CardHeader title="Проект «Дом»" icon={<Icon name="folder" size={18} />} />
          <CardBody>Обычная не интерактивная карточка.</CardBody>
        </Card>
      </Example>
      <Example testId="example-card-interactive" label="Interactive">
        <Card interactive padding="md" onClick={() => {}} style={{ width: 240 }}>
          <CardHeader title="Открыть проект" />
          <CardBody>Клик/Enter/Space активируют карточку.</CardBody>
        </Card>
      </Example>

      <Example testId="example-checkbox-states" label="Default / Checked / Disabled">
        <div className="dev-stack">
          <Checkbox label="Не отмечен" />
          <Checkbox label="Отмечен" defaultChecked />
          <Checkbox label="Недоступен" disabled />
        </div>
      </Example>

      <ChipExamples />

      <Example testId="example-divider" label="Horizontal / Vertical">
        <div className="dev-stack" style={{ width: 200 }}>
          <span>Сверху</span>
          <Divider />
          <span>Снизу</span>
        </div>
        <div className="dev-row" style={{ height: 40 }}>
          <span>Слева</span>
          <Divider orientation="vertical" />
          <span>Справа</span>
        </div>
      </Example>

      <IconGrid />

      <Example testId="example-icon-button-variants" label="Variant">
        <div className="dev-row">
          <IconButton icon="add" label="Добавить" variant="primary" />
          <IconButton icon="settings" label="Настройки" variant="secondary" />
          <IconButton icon="more" label="Ещё" variant="ghost" />
          <IconButton icon="delete" label="Удалить" variant="destructive" />
        </div>
      </Example>
      <Example testId="example-icon-button-loading-disabled" label="Loading / Disabled">
        <div className="dev-row">
          <IconButton icon="sync" label="Синхронизация" loading />
          <IconButton icon="add" label="Недоступно" disabled />
        </div>
      </Example>

      <InputExamples />

      <Example testId="example-radio-states" label="Default / Selected / Disabled">
        <div className="dev-stack">
          <Radio name="dev-radio" label="Не выбран" />
          <Radio name="dev-radio" label="Выбран" defaultChecked />
          <Radio name="dev-radio-disabled" label="Недоступен" disabled />
        </div>
      </Example>

      <SegmentedControlExample />

      <Example testId="example-service-mark-shapes" label="Squircle / Rounded / Circle / Bare">
        <div className="dev-row">
          <ServiceMark shape="squircle" size={48} />
          <ServiceMark shape="rounded" size={48} />
          <ServiceMark shape="circle" size={48} />
          <ServiceMark bare size={32} />
        </div>
      </Example>

      <Example testId="example-spinner-sizes-tones" label="Size × Tone">
        <div className="dev-row">
          <Spinner size="sm" tone="primary" label="Загрузка" />
          <Spinner size="md" tone="muted" label="Загрузка" />
          <Spinner size="lg" tone="primary" label="Загрузка" />
        </div>
      </Example>

      <Example testId="example-switch-states" label="On / Off / Disabled">
        <div className="dev-stack">
          <Switch label="Выключен" />
          <Switch label="Включён" defaultChecked />
          <Switch label="Недоступен" disabled />
        </div>
      </Example>

      <TextareaExamples />

      <Example testId="example-tooltip" label="Триггер (наводится/фокусируется)">
        <Tooltip content="Подсказка появляется по hover/focus">
          <Button variant="secondary">Наведи курсор</Button>
        </Tooltip>
      </Example>
    </HarnessSection>
  );
}
