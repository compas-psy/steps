import { describe, expect, it, vi } from 'vitest';

import { createAppController } from '../../src/state/store.js';

describe('AppController', () => {
  it('начинает с экрана launch и localMode=false', () => {
    const controller = createAppController();
    expect(controller.getState()).toEqual({ screen: 'launch', localMode: false });
  });

  it('goTo меняет текущий экран и уведомляет подписчиков', () => {
    const controller = createAppController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.goTo('welcome');

    expect(controller.getState().screen).toBe('welcome');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ screen: 'welcome' }));
  });

  it('continueLocally включает localMode и сразу переходит на firstTask (ТЗ §1.3 — локальный режим без аккаунта)', () => {
    const controller = createAppController();

    controller.continueLocally();

    expect(controller.getState()).toEqual({ screen: 'firstTask', localMode: true });
  });

  it('subscribe возвращает функцию отписки — после неё слушатель больше не вызывается', () => {
    const controller = createAppController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    controller.goTo('welcome');

    expect(listener).not.toHaveBeenCalled();
  });

  it('принимает частичное начальное состояние', () => {
    const controller = createAppController({ screen: 'signIn' });
    expect(controller.getState()).toEqual({ screen: 'signIn', localMode: false });
  });
});
