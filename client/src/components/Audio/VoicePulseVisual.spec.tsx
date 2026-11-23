// AI-system attribution: OpenAI Codex desktop (OpenAI); task
// 01a0aca7-f6db-7543-8cf3-1d1e646a47ab; ACT1250; 2026-11-23.
import { render, screen } from '@testing-library/react';
import VoicePulseVisual from './VoicePulseVisual';

describe('VoicePulseVisual', () => {
  it('is still and truthful while idle', () => {
    render(<VoicePulseVisual isSpeaking={false} isLoading={false} />);

    const visual = screen.getByTestId('voice-pulse-visual');
    expect(visual).toHaveAttribute('data-state', 'idle');
    expect(visual).toHaveAccessibleName('Voice monitor: idle');
  });

  it('moves into speaking state only when reply speech is playing', () => {
    render(<VoicePulseVisual isSpeaking={true} isLoading={false} />);

    const visual = screen.getByTestId('voice-pulse-visual');
    expect(visual).toHaveAttribute('data-state', 'speaking');
    expect(visual).toHaveAccessibleName('Voice monitor: speaking');
  });

  it('shows unavailable instead of pretending to speak', () => {
    render(
      <VoicePulseVisual isSpeaking={true} isLoading={true} isUnavailable={true} />,
    );

    const visual = screen.getByTestId('voice-pulse-visual');
    expect(visual).toHaveAttribute('data-state', 'unavailable');
    expect(visual).toHaveAccessibleName('Voice monitor: speech unavailable');
  });
});
