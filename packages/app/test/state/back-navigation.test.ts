/**
 * Аппаратная «Назад» Android и браузерная «Назад».
 *
 * Дефект, который эти тесты закрывают, найден отсутствием кода, а не
 * рассуждением: `grep` по `packages/app` и `apps/mobile` не находил ни
 * одного обработчика `popstate`, ни одного `history.pushState`. Навигация
 * ШАГОВ — состояние контроллера, поэтому у WebView история из одной
 * записи, и системная кнопка «Назад» закрывала приложение с любого экрана.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Uuid } from '@shagi/core';

import { createAppController } from '../../src/state/store.js';
import { installBackNavigation } from '../../src/state/back-navigation.js';

const TASK_ID = '00000000-0000-7000-8000-00000000ab01' as Uuid;

describe('AppController.goBack', () => {
  it('оверлей Quick Add снимается раньше самого экрана', () => {
    const controller = createAppController({ screen: 'taskDetail', returnScreen: 'todayEmpty' });
    controller.openQuickAdd('global');

    expect(controller.goBack()).toBe(true);
    expect(controller.getState().quickAdd).toBeNull();
    // Экран НЕ сменился: снят только оверлей.
    expect(controller.getState().screen).toBe('taskDetail');
  });

  it('с карточки задачи возвращает туда, откуда её открыли — как кнопка «Готово»', () => {
    const controller = createAppController({ screen: 'inbox' });
    controller.openTask(TASK_ID);

    expect(controller.goBack()).toBe(true);
    expect(controller.getState().screen).toBe('inbox');
    expect(controller.getState().selectedTaskId).toBeNull();
  });

  it('из подэкрана настроек возвращает в настройки, а не выбрасывает на Today', () => {
    const controller = createAppController({ screen: 'exportData' });
    expect(controller.goBack()).toBe(true);
    expect(controller.getState().screen).toBe('settings');
  });

  it('из юридического документа возвращает в «Данные и конфиденциальность»', () => {
    const controller = createAppController({ screen: 'legalPrivacyPolicy' });
    expect(controller.goBack()).toBe(true);
    expect(controller.getState().screen).toBe('dataPrivacy');
  });

  it('из проекта возвращает к списку проектов', () => {
    const controller = createAppController({ screen: 'projectDetail' });
    expect(controller.goBack()).toBe(true);
    expect(controller.getState().screen).toBe('projects');
  });

  it.each(['inbox', 'projects', 'search', 'plan', 'completed'] as const)(
    'с «%s» возвращает на Today',
    (screen) => {
      const controller = createAppController({ screen });
      expect(controller.goBack()).toBe(true);
      expect(controller.getState().screen).toBe('todayEmpty');
    },
  );

  it('на Today возвращаться некуда — кнопку обязана получить система', () => {
    // Приложение, из которого нельзя выйти кнопкой «Назад», — ловушка.
    const controller = createAppController({ screen: 'todayEmpty' });
    expect(controller.goBack()).toBe(false);
    expect(controller.getState().screen).toBe('todayEmpty');
  });

  it.each(['welcome', 'signIn', 'firstTask', 'nlpOnboarding'] as const)(
    'онбординг «%s» назад не отматывается',
    (screen) => {
      const controller = createAppController({ screen });
      expect(controller.goBack()).toBe(false);
      expect(controller.getState().screen).toBe(screen);
    },
  );
});

describe('ловушка в истории', () => {
  beforeEach(() => {
    // Свежая история на каждый тест: записи предыдущего иначе переживают его.
    window.history.replaceState(null, '', window.location.href);
  });

  it('на корневом экране ловушка НЕ ставится — «Назад» уходит системе', () => {
    const controller = createAppController({ screen: 'todayEmpty' });
    const before = window.history.length;

    const handle = installBackNavigation(controller);
    expect(window.history.length).toBe(before);

    handle.dispose();
  });

  it('уход с корня ставит ловушку, и «Назад» тратится на неё, а не на выход', async () => {
    const controller = createAppController({ screen: 'todayEmpty' });
    const handle = installBackNavigation(controller);

    const before = window.history.length;
    controller.goTo('inbox');
    // Именно ЭТОГО и не было: история приложения не росла, поэтому у
    // WebView не было куда возвращаться.
    expect(window.history.length).toBe(before + 1);

    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(controller.getState().screen).toBe('todayEmpty');

    handle.dispose();
  });

  it('после dispose «Назад» больше не управляет приложением', async () => {
    const controller = createAppController({ screen: 'inbox' });
    const handle = installBackNavigation(controller);
    handle.dispose();

    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(controller.getState().screen).toBe('inbox');
  });
});
