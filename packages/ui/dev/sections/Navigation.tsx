/**
 * Секция «Navigation» харнесса (E03.2) — Breadcrumb/BottomNav/CommandPalette/
 * Sidebar/Tabs/TopBar. `CommandPalette` рендерится открытым в `Frame`
 * (position: fixed внутри своей рамки, см. `Example.tsx`).
 */
import { type ReactElement, useState } from 'react';

import {
  Breadcrumb,
  BottomNav,
  CommandPalette,
  IconButton,
  ServiceMark,
  Sidebar,
  Tabs,
  TopBar,
} from '../../src/components/index.js';
import { Example, Frame, HarnessSection } from './Example.js';

function BreadcrumbExample(): ReactElement {
  return (
    <Example testId="example-breadcrumb" label="Хлебная крошка">
      <Breadcrumb
        label="Путь до текущего проекта"
        onSelect={() => {}}
        items={[
          { value: 'projects', label: 'Проекты' },
          { value: 'home', label: 'Дом' },
          { value: 'renovation', label: 'Ремонт' },
        ]}
      />
    </Example>
  );
}

function BottomNavExample(): ReactElement {
  const [value, setValue] = useState('today');
  return (
    <Example testId="example-bottom-nav" label="4 пункта + центральная кнопка" wide>
      <BottomNav
        label="Основная навигация"
        value={value}
        onChange={setValue}
        items={[
          { value: 'today', label: 'Сегодня', icon: 'inbox' },
          { value: 'plan', label: 'План', icon: 'calendar' },
          { value: 'projects', label: 'Проекты', icon: 'folder' },
          { value: 'search', label: 'Поиск', icon: 'search' },
        ]}
        centerAction={{ icon: 'add', label: 'Быстрое добавление', onClick: () => {} }}
      />
    </Example>
  );
}

function CommandPaletteExample(): ReactElement {
  const [query, setQuery] = useState('куп');
  return (
    <Example testId="example-command-palette" label="Открыта, с результатами" wide>
      <Frame height={420}>
        <CommandPalette
          open
          label="Командная палитра"
          closeLabel="Закрыть палитру"
          placeholder="Найти задачу или команду…"
          query={query}
          onQueryChange={setQuery}
          onSelect={() => {}}
          onClose={() => {}}
          items={[
            { value: 'buy-tickets', label: 'Купить билеты', icon: 'add', hint: '⌘⏎' },
            { value: 'buy-groceries', label: 'Купить продукты', icon: 'add' },
            { value: 'search', label: 'Найти по всем задачам', icon: 'search', disabled: true },
          ]}
        />
      </Frame>
    </Example>
  );
}

function CommandPaletteEmptyExample(): ReactElement {
  return (
    <Example testId="example-command-palette-empty" label="Открыта, пусто" wide>
      <Frame height={280}>
        <CommandPalette
          open
          label="Командная палитра"
          closeLabel="Закрыть палитру"
          query="несуществующий запрос"
          onQueryChange={() => {}}
          onSelect={() => {}}
          onClose={() => {}}
          items={[]}
          emptyState="Ничего не найдено"
        />
      </Frame>
    </Example>
  );
}

function SidebarExample(): ReactElement {
  const [value, setValue] = useState('today');
  return (
    <Example testId="example-sidebar" label="Секции, активный и приглушённый пункт" wide>
      <Frame height={420}>
        <Sidebar
          label="Основная навигация"
          value={value}
          onChange={setValue}
          header={
            <div className="dev-row">
              <ServiceMark size={28} />
              <span>ШАГИ</span>
            </div>
          }
          sections={[
            {
              key: 'main',
              items: [
                { value: 'today', label: 'Сегодня', icon: 'inbox' },
                { value: 'plan', label: 'План', icon: 'calendar' },
                { value: 'inbox', label: 'Входящие', icon: 'inbox', badge: '3' },
              ],
            },
            {
              key: 'projects',
              title: 'Проекты',
              items: [
                { value: 'home', label: 'Дом', icon: 'folder' },
                { value: 'work', label: 'Работа', icon: 'folder', disabled: true },
              ],
            },
            {
              key: 'other',
              items: [{ value: 'done', label: 'Завершённые', icon: 'checklist', muted: true }],
            },
          ]}
          footer={<IconButton icon="settings" label="Настройки" variant="ghost" />}
        />
      </Frame>
    </Example>
  );
}

function TabsExample(): ReactElement {
  const [value, setValue] = useState('active');
  return (
    <Example testId="example-tabs" label="Активная / отключённая вкладка" wide>
      <Tabs
        label="Задачи проекта"
        value={value}
        onChange={setValue}
        items={[
          { value: 'active', label: 'Активные', panel: 'Список активных задач.' },
          { value: 'done', label: 'Завершённые', panel: 'Список завершённых задач.' },
          { value: 'archived', label: 'Архив', panel: 'Пусто.', disabled: true },
        ]}
      />
    </Example>
  );
}

function TopBarExample(): ReactElement {
  return (
    <Example testId="example-topbar" label="Leading + заголовок + действия" wide>
      <TopBar
        leading={<IconButton icon="back" label="Назад" variant="ghost" />}
        actions={
          <div className="dev-row">
            <IconButton icon="search" label="Поиск" variant="ghost" />
            <IconButton icon="more" label="Ещё" variant="ghost" />
          </div>
        }
      >
        Сегодня
      </TopBar>
    </Example>
  );
}

export function NavigationSection(): ReactElement {
  return (
    <HarnessSection testId="section-navigation" title="Navigation">
      <BreadcrumbExample />
      <BottomNavExample />
      <CommandPaletteExample />
      <CommandPaletteEmptyExample />
      <SidebarExample />
      <TabsExample />
      <TopBarExample />
    </HarnessSection>
  );
}
