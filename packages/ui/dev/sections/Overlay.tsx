/**
 * Секция «Overlay» харнесса (E03.3) — BottomSheet/Modal/Menu/Popover/
 * SideInspector, все показаны открытыми (`open`), не через обычный
 * триггер — витрина статична (см. заголовок задания оркестратора).
 * `Modal`/`BottomSheet` — `position: fixed`, поэтому рамка (`Frame`)
 * оборачивает их в трансформированный контейнер (см. `Example.tsx`);
 * `Menu`/`Popover` — `position: absolute` относительно небольшого якоря
 * (`.dev-menu-anchor`/`.dev-popover-anchor`, `../harness.css`), но всё равно
 * внутри `Frame`, чтобы выпадающая панель не обрезалась границами
 * скриншота Playwright (у `position: absolute`-потомка нет своего вклада в
 * высоту предка — без явной высоты рамки панель отрисуется за пределами
 * области, которую захватывает `locator.screenshot()`).
 */
import type { ReactElement } from 'react';

import {
  Button,
  BottomSheet,
  IconButton,
  Menu,
  Modal,
  Popover,
  SideInspector,
} from '../../src/components/index.js';
import { Example, Frame, HarnessSection } from './Example.js';

function ModalExample(): ReactElement {
  return (
    <Example testId="example-modal-open" label="Открыт, с футером" wide>
      <Frame height={480} center>
        <Modal
          open
          onClose={() => {}}
          title="Удалить задачу?"
          footer={
            <>
              <Button variant="secondary">Отмена</Button>
              <Button variant="destructive">Удалить</Button>
            </>
          }
        >
          Это действие нельзя отменить.
        </Modal>
      </Frame>
    </Example>
  );
}

function BottomSheetExample(): ReactElement {
  return (
    <Example testId="example-bottom-sheet-open" label="Открыт, с футером" wide>
      <Frame height={420}>
        <BottomSheet
          open
          onClose={() => {}}
          title="Перенести задачу"
          footer={
            <>
              <Button block>На завтра</Button>
              <Button block variant="secondary">
                Выбрать дату
              </Button>
            </>
          }
        >
          Задача «Купить билеты» будет перенесена.
        </BottomSheet>
      </Frame>
    </Example>
  );
}

function MenuExample(): ReactElement {
  return (
    <Example testId="example-menu-open" label="Открыто, частые/редкие/destructive" wide>
      <Frame height={340}>
        <div className="dev-menu-anchor">
          <IconButton icon="more" label="Меню задачи" variant="ghost" />
          <Menu
            open
            onClose={() => {}}
            aria-label="Действия с задачей"
            sections={[
              {
                key: 'frequent',
                items: [
                  { key: 'complete', label: 'Выполнить', icon: 'check' },
                  { key: 'today', label: 'Перенести на сегодня', icon: 'moveToToday' },
                ],
              },
              {
                key: 'rare',
                items: [
                  { key: 'duplicate', label: 'Дублировать', icon: 'import' },
                  { key: 'archive', label: 'Архивировать', icon: 'archive', disabled: true },
                ],
              },
              {
                key: 'destructive',
                items: [
                  { key: 'delete', label: 'Удалить', icon: 'delete', variant: 'destructive' },
                ],
              },
            ]}
          />
        </div>
      </Frame>
    </Example>
  );
}

function PopoverExample(): ReactElement {
  return (
    <Example testId="example-popover-open" label="Открыт (bottom)" wide>
      <Frame height={220} center>
        <div className="dev-popover-anchor">
          <Popover
            open
            onClose={() => {}}
            placement="bottom"
            aria-label="Быстрые сведения о задаче"
            anchor={<Button variant="secondary">Дата</Button>}
          >
            Запланировано на 3 сентября, 09:00.
          </Popover>
        </div>
      </Frame>
    </Example>
  );
}

function SideInspectorExample(): ReactElement {
  return (
    <Example testId="example-side-inspector-open" label="Открыта (не модальная)" wide>
      <Frame height={420}>
        <SideInspector
          open
          title="Купить билеты"
          actions={
            <IconButton icon="close" label="Закрыть панель" variant="ghost" onClick={() => {}} />
          }
        >
          Список задач позади остаётся видимым и кликабельным.
        </SideInspector>
      </Frame>
    </Example>
  );
}

export function OverlaySection(): ReactElement {
  return (
    <HarnessSection testId="section-overlay" title="Overlay">
      <ModalExample />
      <BottomSheetExample />
      <MenuExample />
      <PopoverExample />
      <SideInspectorExample />
    </HarnessSection>
  );
}
