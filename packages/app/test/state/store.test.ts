import { describe, expect, it, vi } from 'vitest';

import { generateUuidV7 } from '@shagi/core';

import { createAppController } from '../../src/state/store.js';

describe('AppController', () => {
  it('начинает с экрана launch, localMode=false и selectedProjectId=null', () => {
    const controller = createAppController();
    expect(controller.getState()).toEqual({
      screen: 'launch',
      localMode: false,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: null,
    });
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

    expect(controller.getState()).toEqual({
      screen: 'firstTask',
      localMode: true,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: null,
    });
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
    expect(controller.getState()).toEqual({
      screen: 'signIn',
      localMode: false,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: null,
    });
  });

  it('openProject переходит на projectDetail и запоминает выбранный проект', () => {
    const controller = createAppController();
    const listener = vi.fn();
    controller.subscribe(listener);
    const projectId = generateUuidV7();

    controller.openProject(projectId);

    expect(controller.getState()).toEqual({
      screen: 'projectDetail',
      localMode: false,
      selectedProjectId: projectId,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: null,
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ screen: 'projectDetail', selectedProjectId: projectId }),
    );
  });

  it('openTask переходит на taskDetail, запоминает задачу и экран-источник для возврата', () => {
    const controller = createAppController({ screen: 'inbox' });
    const listener = vi.fn();
    controller.subscribe(listener);
    const taskId = generateUuidV7();

    controller.openTask(taskId);

    expect(controller.getState()).toEqual({
      screen: 'taskDetail',
      localMode: false,
      selectedProjectId: null,
      selectedTaskId: taskId,
      returnScreen: 'inbox',
      quickAdd: null,
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: taskId,
        returnScreen: 'inbox',
      }),
    );
  });

  it('closeTask возвращает на returnScreen и сбрасывает selectedTaskId/returnScreen', () => {
    const controller = createAppController({ screen: 'projectDetail' });
    const taskId = generateUuidV7();
    controller.openTask(taskId);

    controller.closeTask();

    expect(controller.getState()).toEqual({
      screen: 'projectDetail',
      localMode: false,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: null,
    });
  });

  it('closeTask без returnScreen (защитная ветка) откатывается на todayEmpty', () => {
    const controller = createAppController({ screen: 'taskDetail', returnScreen: null });

    controller.closeTask();

    expect(controller.getState()).toEqual({
      screen: 'todayEmpty',
      localMode: false,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: null,
    });
  });

  it('openQuickAdd открывает оверлей с указанным origin, не меняя screen (D12 — callable from any route)', () => {
    const controller = createAppController({ screen: 'projectDetail' });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.openQuickAdd('today');

    expect(controller.getState()).toEqual({
      screen: 'projectDetail',
      localMode: false,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: { origin: 'today' },
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ quickAdd: { origin: 'today' } }),
    );
  });

  it('closeQuickAdd закрывает оверлей, не меняя screen под ним', () => {
    const controller = createAppController({ screen: 'inbox' });
    controller.openQuickAdd('inbox');

    controller.closeQuickAdd();

    expect(controller.getState()).toEqual({
      screen: 'inbox',
      localMode: false,
      selectedProjectId: null,
      selectedTaskId: null,
      returnScreen: null,
      quickAdd: null,
    });
  });
});
