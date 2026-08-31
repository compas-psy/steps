/**
 * Секция «Task» харнесса (E03.4) — ChecklistRow/FocusMarker/SubtaskRow/
 * TaskCheckbox/TaskDetail/TaskMenu/TaskMetadata/TaskRow. `TaskRow` — все
 * девять состояний `TaskRowState` (`../../src/components/task/TaskRow.tsx`
 * JSDoc), по одному примеру на каждое.
 */
import type { ReactElement } from 'react';

import {
  Button,
  ChecklistRow,
  FocusMarker,
  IconButton,
  SubtaskRow,
  TaskCheckbox,
  TaskDetail,
  TaskMenu,
  TaskMetadata,
  TaskMetadataItem,
  TaskRow,
  type TaskRowState,
} from '../../src/components/index.js';
import { Example, Frame, HarnessSection } from './Example.js';

const TASK_ROW_STATES: readonly { readonly state: TaskRowState; readonly label: string }[] = [
  { state: 'normal', label: 'normal' },
  { state: 'focus', label: 'focus' },
  { state: 'missedPlan', label: 'missedPlan' },
  { state: 'deadlineSoon', label: 'deadlineSoon' },
  { state: 'deadlineMissed', label: 'deadlineMissed' },
  { state: 'recurring', label: 'recurring' },
  { state: 'completed', label: 'completed' },
  { state: 'selected', label: 'selected' },
  { state: 'dragging', label: 'dragging' },
];

function statusLabelFor(state: TaskRowState): string | undefined {
  switch (state) {
    case 'missedPlan':
      return 'не выполнено 28 авг';
    case 'deadlineSoon':
      return 'срок — завтра';
    case 'deadlineMissed':
      return 'просрочено';
    default:
      return undefined;
  }
}

function TaskRowStates(): ReactElement {
  return (
    <Example testId="example-task-row-states" label="Все 9 состояний" wide>
      <div className="dev-stack">
        {TASK_ROW_STATES.map(({ state, label }) => (
          <div key={state} data-testid={`task-row-${label}`}>
            <TaskRow
              title="Купить билеты на поезд"
              state={state}
              checked={state === 'completed'}
              checkboxLabel="Купить билеты на поезд"
              statusLabel={statusLabelFor(state)}
              metadata={
                <TaskMetadata>
                  <TaskMetadataItem icon="folder">Дом</TaskMetadataItem>
                </TaskMetadata>
              }
            />
          </div>
        ))}
      </div>
    </Example>
  );
}

export function TaskSection(): ReactElement {
  return (
    <HarnessSection testId="section-task" title="Task">
      <Example testId="example-checklist-row-states" label="Checked / Unchecked / Disabled">
        <div className="dev-stack">
          <ChecklistRow label="Взять зарядку" checked={false} />
          <ChecklistRow label="Взять пропуск" checked />
          <ChecklistRow label="Недоступно" checked={false} disabled />
        </div>
      </Example>

      <Example testId="example-focus-marker" label="Маркер «Главное»">
        <div className="dev-row">
          <FocusMarker />
          <span>Купить билеты</span>
        </div>
      </Example>

      <Example testId="example-subtask-row" label="Подзадача (композиция над TaskRow)" wide>
        <SubtaskRow
          title="Забронировать место"
          checked={false}
          checkboxLabel="Забронировать место"
        />
      </Example>

      <Example testId="example-task-checkbox-states" label="Default / Focus / Disabled">
        <div className="dev-row">
          <TaskCheckbox label="Обычная задача" />
          <TaskCheckbox label="Задача «Главное»" focus />
          <TaskCheckbox label="Недоступна" disabled />
        </div>
      </Example>

      <TaskRowStates />

      <Example testId="example-task-menu-open" label="Открыто над задачей" wide>
        <Frame height={340}>
          <div className="dev-menu-anchor">
            <IconButton icon="more" label="Меню задачи" variant="ghost" />
            <TaskMenu
              open
              onClose={() => {}}
              aria-label="Действия с задачей"
              frequentActions={[
                { key: 'complete', label: 'Выполнить', icon: 'check' },
                { key: 'focus', label: 'Сделать главным', icon: 'star' },
              ]}
              rareActions={[{ key: 'duplicate', label: 'Дублировать', icon: 'import' }]}
              destructiveAction={{ key: 'delete', label: 'Удалить', icon: 'delete' }}
            />
          </div>
        </Frame>
      </Example>

      <Example testId="example-task-metadata" label="Дата · проект · метка">
        <TaskMetadata>
          <TaskMetadataItem icon="calendar">3 сен</TaskMetadataItem>
          <TaskMetadataItem icon="folder">Дом</TaskMetadataItem>
          <TaskMetadataItem icon="tags">Срочно</TaskMetadataItem>
        </TaskMetadata>
      </Example>

      <Example testId="example-task-detail" label="Полная карточка задачи" wide>
        <TaskDetail
          header={
            <div className="dev-row" style={{ width: '100%', justifyContent: 'space-between' }}>
              <div className="dev-row">
                <TaskCheckbox label="Купить билеты на поезд" focus />
                <span>Купить билеты на поезд</span>
              </div>
              <IconButton icon="more" label="Меню задачи" variant="ghost" />
            </div>
          }
          metadata={
            <TaskMetadata>
              <TaskMetadataItem icon="calendar">3 сен, 09:00</TaskMetadataItem>
              <TaskMetadataItem icon="folder">Поездка</TaskMetadataItem>
            </TaskMetadata>
          }
          subtasks={
            <div className="dev-stack">
              <SubtaskRow title="Выбрать поезд" checked checkboxLabel="Выбрать поезд" />
              <SubtaskRow title="Оплатить" checked={false} checkboxLabel="Оплатить" />
            </div>
          }
          checklist={
            <div className="dev-stack">
              <ChecklistRow label="Паспорт" checked />
              <ChecklistRow label="Распечатать билет" checked={false} />
            </div>
          }
          actions={
            <div className="dev-row">
              <Button variant="primary">Выполнить</Button>
              <Button variant="secondary">Перенести</Button>
            </div>
          }
        />
      </Example>
    </HarnessSection>
  );
}
