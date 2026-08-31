/**
 * Реестр экранов по `ScreenId` (`../state/store.ts`) — `App.tsx` рендерит
 * `SCREENS[state.screen]`. Экран, которого ещё нет в реестре, рендерится
 * как пустой узел (не падение) — так пакеты работ эпика E04 добавляют
 * экраны по одному, не блокируя друг друга правкой одного и того же файла:
 * каждый пакет работ добавляет сюда одну строку реэкспорта плюс запись в
 * этом объекте, конфликтов на уровне файла — минимум.
 *
 * Матрица M01–M06 (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`), эпик E04:
 * Launch, Welcome, Sign in, First task, NLP onboarding заполнены пакетом
 * работ E04.2. `todayEmpty` (M06) сюда намеренно не входил до этого пакета
 * работ — эпик E06 («Today: выборки, группы, precedence»), не E04.
 * `ScreenId` уже содержал `'todayEmpty'` (заведён каркасом E04.1 заранее);
 * пакет работ E06.1 добавляет для него запись `Today` — сам компонент
 * решает по факту данных (`selectTodayTasks`), показать M06 Empty или
 * M07 Normal, имя экрана в реестре не переименовано (уже согласовано).
 */
import type { ComponentType } from 'react';

import type { ScreenId } from '../state/store.js';
import { FirstTask } from './FirstTask.js';
import { Launch } from './Launch.js';
import { NlpOnboarding } from './NlpOnboarding.js';
import { SignIn } from './SignIn.js';
import { Today } from './Today.js';
import { Welcome } from './Welcome.js';

export { FirstTask } from './FirstTask.js';
export { Launch } from './Launch.js';
export { NlpOnboarding } from './NlpOnboarding.js';
export { SignIn } from './SignIn.js';
export { Today } from './Today.js';
export { Welcome } from './Welcome.js';

export const SCREENS: Partial<Record<ScreenId, ComponentType>> = {
  launch: Launch,
  welcome: Welcome,
  signIn: SignIn,
  firstTask: FirstTask,
  nlpOnboarding: NlpOnboarding,
  todayEmpty: Today,
};
