/**
 * `Priority` — индикатор приоритета P1–P4 (§10 «Organization»,
 * `.ultraplan/research/02-ui.md` M32 «Priority P1–P4, без автопересортировки
 * списка при смене»). Чисто презентационный бейдж: принимает готовый
 * `level` и готовый текст (`children`, например «P1 · Критично» — сама
 * подпись «Критично»/локаль решает `packages/i18n` + `packages/app`, не
 * этот компонент, ТЗ §3), не сортирует и не пересчитывает список — это
 * домен (`@shagi/core`), явно вне периметра этого пакета работ.
 *
 * Цвет по уровню — решение этого пакета работ, явной таблицы P1–P4 →
 * цвет нет ни в §10, ни в `02-ui.md`: единственный прямой прецедент —
 * прототип (`ШАГИ - R1 Design.dc.html`, строка 447) рисует «P2 · Важно»
 * бейджем `variant="pending"` (`--orange-soft`/`--orange-500`), а §16
 * «System filters R1» называет системный фильтр «P1 / Критичные», что
 * согласуется с уже устоявшейся семантикой `--red-*` = критично/просрочено
 * (§4.1). Отсюда: P1 red (критично, тот же тон, что deadline missed),
 * P2 orange (дословно совпадает с прототипом), P3 blue (нейтральный
 * информационный тон, как `Badge.info`), P4 neutral (мутный, низший
 * приоритет). `gold` сознательно не занят — он уже закреплён за
 * Today Focus (§4.1), другая семантика, не хотим коллизии значений одного
 * токена. Если оркестратор примет другое сопоставление — это чистая смена
 * CSS-класса, `level` как API не меняется.
 */
import type { ReactElement, ReactNode } from 'react';

import './Priority.css';

export type PriorityLevel = 'p1' | 'p2' | 'p3' | 'p4';

export interface PriorityProps {
  readonly level: PriorityLevel;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Priority({ level, children, className }: PriorityProps): ReactElement {
  const classes = ['shagi-priority', `shagi-priority--${level}`, className]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}
