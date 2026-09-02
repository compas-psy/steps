/**
 * `Launch` — M01 (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`): «local/offline
 * startup; no auth wall; no fake loader after local DB ready».
 *
 * Ничего не рендерит: `useStorage()` в `state/context.tsx` мемоизирован в
 * `AppProvider` и построен ДО того, как этот компонент смонтируется —
 * локальное хранилище к этому моменту уже готово, поэтому здесь нет ни
 * спиннера, ни «загрузки», которых ТЗ и не просит.
 *
 * --- Единственное решение этого экрана: куда вести человека ------------------
 *
 * Раньше он безусловно уходил на `'welcome'`, и продукт ВСЕГДА открывался
 * онбордингом — сколько бы задач ни лежало в хранилище. Это было поймано
 * дымовым тестом на живом Android (создали задачу → `am force-stop` →
 * запуск → снова «Что мне делать дальше?») и разобрано до причины: на вебе
 * та же связка показала, что база после перезагрузки на месте и задача в
 * ней есть — терялась ровно навигация запуска, не данные.
 *
 * Решение принимается по двум сигналам (полный разбор — `../state/
 * onboarding.ts`): явный флаг «онбординг пройден» и, если его нет, факт
 * наличия задач в хранилище. Второй сигнал нужен там, где флага быть не
 * может: порт настроек недоступен или установка сделана до его появления.
 *
 * Асинхронность здесь не «загрузка», а один запрос к уже готовому
 * хранилищу; до его ответа экран честно пуст — рисовать что-либо на 20
 * миллисекунд и тут же менять означало бы мигание.
 */
import { useEffect, type ReactElement } from 'react';

import { useAppController, useHost, useStorage } from '../state/context.js';
import { isOnboardingDone } from '../state/onboarding.js';

export function Launch(): ReactElement | null {
  const controller = useAppController();
  const host = useHost();
  const storage = useStorage();

  useEffect(() => {
    let cancelled = false;

    async function decide(): Promise<void> {
      if (isOnboardingDone(host.platform)) {
        if (!cancelled) controller.goTo('todayEmpty');
        return;
      }
      // Запасной сигнал. Оба статуса, а не только активные: человек,
      // завершивший все свои задачи, продукт УЖЕ видел — показывать ему
      // онбординг было бы враньём о том, что он тут впервые.
      const [active, completed] = await Promise.all([
        storage.tasks.listByStatusAndPlannedDate('active'),
        storage.tasks.listByStatusAndPlannedDate('completed'),
      ]);
      if (cancelled) return;
      controller.goTo(active.length + completed.length > 0 ? 'todayEmpty' : 'welcome');
    }

    void decide();
    return () => {
      cancelled = true;
    };
  }, [controller, host, storage]);

  return null;
}
