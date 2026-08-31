/**
 * Точка монтирования каталога-харнесса `@shagi/ui` (E03 «харнесс a11y и
 * визрегрессии»). Подключает CSS дизайн-системы напрямую из исходников
 * пакета (`../src/tokens/index.css`, `../src/components/index.css`), не
 * через subpath-экспорт `@shagi/ui/tokens.css`/`@shagi/ui/components.css` —
 * харнесс лежит внутри самого пакета, а не потребляет его снаружи (см.
 * задание оркестратора, п.1 «Что уже сделано ЗА тебя»), тот же приём, что
 * `apps/web/src/main.tsx` делает через package export для внешних
 * потребителей.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '../src/tokens/index.css';
import '../src/components/index.css';
import './harness.css';

import { Harness } from './Harness.js';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка харнесса повреждена');

createRoot(container).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
