/**
 * Реестр экранов по `ScreenId` (`../state/store.ts`) — `App.tsx` рендерит
 * `SCREENS[state.screen]`. Экран, которого ещё нет в реестре, рендерится
 * как пустой узел (не падение) — так пакеты работ эпика E04 добавляют
 * экраны по одному, не блокируя друг друга правкой одного и того же файла:
 * каждый пакет работ добавляет сюда одну строку реэкспорта плюс запись в
 * этом объекте, конфликтов на уровне файла — минимум.
 *
 * Матрица M01–M06 (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`), эпик E04:
 * Launch, Welcome, Sign in, First task, NLP onboarding, Today Empty —
 * заполняются пакетами работ E04.2+.
 */
import type { ComponentType } from 'react';

import type { ScreenId } from '../state/store.js';

export const SCREENS: Partial<Record<ScreenId, ComponentType>> = {};
