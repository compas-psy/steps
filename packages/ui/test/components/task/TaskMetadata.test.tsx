import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskMetadata, TaskMetadataItem } from '../../../src/components/task/index.js';

describe('TaskMetadata', () => {
  it('рендерит переданные слоты как есть, без собственного текста', () => {
    render(
      <TaskMetadata>
        <TaskMetadataItem icon="calendar">27 авг</TaskMetadataItem>
        <TaskMetadataItem icon="folder">Работа</TaskMetadataItem>
      </TaskMetadata>,
    );
    expect(screen.getByText('27 авг')).toBeInTheDocument();
    expect(screen.getByText('Работа')).toBeInTheDocument();
  });

  it('TaskMetadataItem без icon не рендерит иконку-обёртку', () => {
    const { container } = render(<TaskMetadataItem>Без иконки</TaskMetadataItem>);
    expect(container.querySelector('.shagi-task-metadata__item-icon')).not.toBeInTheDocument();
  });
});
