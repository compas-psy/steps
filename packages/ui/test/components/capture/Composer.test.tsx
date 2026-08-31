import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Composer, type ComposerMode } from '../../../src/components/capture/index.js';

function ControlledComposer({
  onChange,
  voiceDisabled = false,
  fileDisabled = false,
}: {
  readonly onChange?: (mode: ComposerMode) => void;
  readonly voiceDisabled?: boolean;
  readonly fileDisabled?: boolean;
}) {
  const [mode, setMode] = useState<ComposerMode>('text');
  return (
    <Composer
      mode={mode}
      onModeChange={(next) => {
        setMode(next);
        onChange?.(next);
      }}
      label="Способ добавления"
      textLabel="Текст"
      voiceLabel="Голос"
      fileLabel="Файл"
      textSlot={<p>Слот текста</p>}
      voiceSlot={<p>Слот голоса</p>}
      fileSlot={<p>Слот файла</p>}
      voiceDisabled={voiceDisabled}
      fileDisabled={fileDisabled}
    />
  );
}

describe('Composer', () => {
  it('переиспользует Tabs: tablist с тремя вкладками Текст/Голос/Файл', () => {
    render(<ControlledComposer />);
    const tablist = screen.getByRole('tablist', { name: 'Способ добавления' });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Текст' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Голос' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Файл' })).toBeInTheDocument();
  });

  it('показывает слот активной вкладки в tabpanel', () => {
    render(<ControlledComposer />);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Слот текста');
  });

  it('переключение вкладки меняет показанный слот', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledComposer onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'Голос' }));

    expect(onChange).toHaveBeenCalledWith('voice');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Слот голоса');
  });

  it('voiceDisabled/fileDisabled — вкладки будущих адаптеров отключаются, не убираются', () => {
    render(<ControlledComposer voiceDisabled fileDisabled />);
    expect(screen.getByRole('tab', { name: 'Голос' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Файл' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Текст' })).not.toBeDisabled();
  });
});
