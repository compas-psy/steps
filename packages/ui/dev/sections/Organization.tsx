/**
 * Секция «Organization» харнесса (E03.6) — BoardCard/BoardColumn/Filter/
 * Label/Priority/ProjectHeader/ProjectRow/Section.
 */
import { type ReactElement, useState } from 'react';

import {
  BoardCard,
  BoardColumn,
  Filter,
  Label,
  Priority,
  ProjectHeader,
  ProjectRow,
  Section,
} from '../../src/components/index.js';
import { Example, HarnessSection } from './Example.js';

function ProjectHeaderExample(): ReactElement {
  const [menuOpen, setMenuOpen] = useState(true);
  return (
    <Example testId="example-project-header" label="Меню открыто" wide>
      <ProjectHeader
        title="Ремонт"
        count="12 задач"
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        menuLabel="Действия с проектом"
        triggerLabel="Меню проекта"
        menuSections={[
          {
            key: 'main',
            items: [
              { key: 'rename', label: 'Переименовать', icon: 'more' },
              { key: 'archive', label: 'Архивировать', icon: 'archive' },
            ],
          },
        ]}
      />
    </Example>
  );
}

export function OrganizationSection(): ReactElement {
  return (
    <HarnessSection testId="section-organization" title="Organization">
      <Example testId="example-board-card-states" label="Default / Selected / Dragging">
        <div className="dev-row">
          <BoardCard meta={<Priority level="p2">P2 · Важно</Priority>} onClick={() => {}}>
            Собрать мебель
          </BoardCard>
          <BoardCard
            selected
            meta={<Priority level="p1">P1 · Критично</Priority>}
            onClick={() => {}}
          >
            Заказать краску
          </BoardCard>
          <BoardCard dragging onClick={() => {}}>
            Вызвать мастера
          </BoardCard>
        </div>
      </Example>

      <Example testId="example-board-column" label="С карточками, drop-target" wide>
        <div className="dev-row" style={{ alignItems: 'stretch' }}>
          <BoardColumn title="Идеи" count={2}>
            <BoardCard onClick={() => {}}>Поменять обои</BoardCard>
            <BoardCard onClick={() => {}}>Новый ковёр</BoardCard>
          </BoardColumn>
          <BoardColumn title="Сделать" count={1} isDropTarget>
            <BoardCard onClick={() => {}}>Собрать мебель</BoardCard>
          </BoardColumn>
        </div>
      </Example>

      <Example testId="example-filter-states" label="Default / Selected / Removable">
        <div className="dev-row">
          <Filter>Без даты</Filter>
          <Filter selected onClick={() => {}}>
            P1 / Критичные
          </Filter>
          <Filter removable removeLabel="Убрать фильтр" onRemove={() => {}}>
            Просрочен срок
          </Filter>
        </div>
      </Example>

      <Example
        testId="example-label-states"
        label="Без маркера / с маркером / selected / removable"
      >
        <div className="dev-row">
          <Label>Без маркера</Label>
          <Label color="violet">С маркером</Label>
          <Label color="blue" selected onClick={() => {}}>
            Выбрана
          </Label>
          <Label color="red" removable removeLabel="Снять метку" onRemove={() => {}}>
            Срочно
          </Label>
        </div>
      </Example>

      <Example testId="example-priority-levels" label="P1–P4">
        <div className="dev-row">
          <Priority level="p1">P1 · Критично</Priority>
          <Priority level="p2">P2 · Важно</Priority>
          <Priority level="p3">P3 · Средне</Priority>
          <Priority level="p4">P4 · Низко</Priority>
        </div>
      </Example>

      <ProjectHeaderExample />

      <Example testId="example-project-row-states" label="Default / Selected / Dragging" wide>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%' }}>
          <ProjectRow name="Дом" color="forest" taskCount={4} onClick={() => {}} />
          <ProjectRow name="Работа" color="blue" taskCount={9} selected onClick={() => {}} />
          <ProjectRow name="Поездка" color="gold" taskCount={2} dragging onClick={() => {}} />
        </ul>
      </Example>

      <Example testId="example-section-states" label="Статичная / развёрнута / свёрнута" wide>
        <div className="dev-stack">
          <Section title="Без раздела" count={3} />
          <Section title="Идеи" count={2} collapsed={false} onToggleCollapse={() => {}} />
          <Section title="Сделано" count={5} collapsed onToggleCollapse={() => {}} />
        </div>
      </Example>
    </HarnessSection>
  );
}
