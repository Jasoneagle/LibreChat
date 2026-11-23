// AI-system attribution: OpenAI Codex desktop (OpenAI); task
// 01a0aca7-f6db-7543-8cf3-1d1e646a47ab; ACT1250; 2026-11-23.
import { memo } from 'react';
import type { CSSProperties } from 'react';

type VoicePulseVisualProps = {
  isSpeaking: boolean;
  isLoading: boolean;
  isUnavailable?: boolean;
};

const BAR_HEIGHTS = [5, 9, 14, 8, 18, 11, 21, 13, 24, 13, 21, 11, 18, 8, 14, 9, 5];

/**
 * A compact, KITT-inspired voice monitor for personality-bound reply speech.
 * Motion follows the existing speech lifecycle; it never starts audio, opens a
 * microphone, or claims that unavailable speech is playing.
 */
function VoicePulseVisual({
  isSpeaking,
  isLoading,
  isUnavailable = false,
}: VoicePulseVisualProps) {
  const state = isUnavailable
    ? 'unavailable'
    : isSpeaking
      ? 'speaking'
      : isLoading
        ? 'loading'
        : 'idle';
  const label =
    state === 'speaking'
      ? 'Voice monitor: speaking'
      : state === 'loading'
        ? 'Voice monitor: preparing speech'
        : state === 'unavailable'
          ? 'Voice monitor: speech unavailable'
          : 'Voice monitor: idle';

  return (
    <div
      className="lc-voice-pulse"
      data-state={state}
      data-testid="voice-pulse-visual"
      role="status"
      aria-label={label}
      title={label}
    >
      <span className="lc-voice-pulse__rail" aria-hidden="true" />
      <span className="lc-voice-pulse__bars" aria-hidden="true">
        {BAR_HEIGHTS.map((height, index) => (
          <span
            // The shape is intentionally symmetrical around the center scanner.
            key={`${height}-${index}`}
            className="lc-voice-pulse__bar"
            style={
              {
                '--voice-pulse-height': `${height}px`,
                '--voice-pulse-delay': `${index * -47}ms`,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <span className="lc-voice-pulse__scanner" aria-hidden="true" />
    </div>
  );
}

export default memo(VoicePulseVisual);
