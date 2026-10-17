// AI-system attribution: OpenAI Codex desktop (OpenAI); reported model gpt-6.1-sol;
// task 01a0aca7-f6db-7543-8cf3-1d1e646a47ab; ACT1250; 2026-10-17.
/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Square } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { VolumeIcon, VolumeMuteIcon, Spinner } from '@librechat/client';
import type { TMessageAudio } from '~/common';
import { useLocalize, useTTSBrowser, useTTSExternal } from '~/hooks';
import { logger } from '~/utils';
import store from '~/store';

export function BrowserTTS({
  isLast,
  index,
  messageId,
  content,
  className,
  renderButton,
  voiceUnavailableReason,
  durableReplySpeech,
}: TMessageAudio) {
  const localize = useLocalize();
  const playbackRate = useRecoilValue(store.playbackRate);

  const { toggleSpeech, isSpeaking, isLoading, audioRef } = useTTSBrowser({
    isLast,
    index,
    messageId,
    content,
  });

  const renderIcon = () => {
    if (isLoading === true) {
      return <Spinner className="icon-md-heavy h-[18px] w-[18px]" />;
    }

    if (isSpeaking === true) {
      return <VolumeMuteIcon className="icon-md-heavy h-[18px] w-[18px]" />;
    }

    return <VolumeIcon className="icon-md-heavy h-[18px] w-[18px]" />;
  };

  useEffect(() => {
    const messageAudio = document.getElementById(`audio-${messageId}`) as HTMLAudioElement | null;
    if (!messageAudio) {
      return;
    }
    if (playbackRate != null && playbackRate > 0 && messageAudio.playbackRate !== playbackRate) {
      messageAudio.playbackRate = playbackRate;
    }
  }, [audioRef, isSpeaking, playbackRate, messageId]);

  logger.log(
    'MessageAudio: audioRef.current?.src, audioRef.current',
    audioRef.current?.src,
    audioRef.current,
  );

  const handleClick = () => {
    if (voiceUnavailableReason) {
      return;
    }
    if (audioRef.current) {
      audioRef.current.muted = false;
    }
    toggleSpeech();
  };

  let title =
    isSpeaking === true || (durableReplySpeech && isLoading)
      ? localize('com_ui_stop')
      : localize('com_ui_read_aloud');
  if (voiceUnavailableReason) {
    title = localize('com_ui_read_aloud_unavailable', { 0: voiceUnavailableReason });
  }

  return (
    <>
      {renderButton ? (
        renderButton({
          onClick: handleClick,
          title: title,
          icon: renderIcon(),
          isActive: isSpeaking || (durableReplySpeech && isLoading),
          isDisabled: Boolean(voiceUnavailableReason),
          className,
        })
      ) : (
        <button className={className} onClickCapture={handleClick} type="button" title={title}>
          {renderIcon()}
        </button>
      )}
      <audio
        ref={audioRef}
        controls
        preload="none"
        controlsList="nodownload nofullscreen noremoteplayback"
        style={{
          position: 'absolute',
          overflow: 'hidden',
          display: 'none',
          height: '0px',
          width: '0px',
        }}
        src={audioRef.current?.src}
        onError={(error) => {
          logger.error('Error fetching audio:', error);
        }}
        id={`audio-${messageId}`}
        autoPlay
      />
    </>
  );
}

export function ExternalTTS({
  isLast,
  index,
  messageId,
  content,
  className,
  renderButton,
  voiceOverride,
  voiceUnavailableReason,
  durableReplySpeech,
}: TMessageAudio) {
  const localize = useLocalize();
  const playbackRate = useRecoilValue(store.playbackRate);

  const {
    toggleSpeech,
    isSpeaking,
    isLoading,
    audioRef,
    durableJob,
    stopSpeech,
    replaySpeech,
    previousParagraph,
    nextParagraph,
  } = useTTSExternal({
    isLast,
    index,
    messageId,
    content,
    voiceOverride,
    durableReplySpeech,
  });

  const renderIcon = () => {
    if (isLoading === true) {
      return <Spinner className="icon-md-heavy h-[18px] w-[18px]" />;
    }

    if (isSpeaking === true) {
      return <VolumeMuteIcon className="icon-md-heavy h-[18px] w-[18px]" />;
    }

    return <VolumeIcon className="icon-md-heavy h-[18px] w-[18px]" />;
  };

  let title = isSpeaking
    ? durableReplySpeech
      ? localize('com_ui_pause')
      : localize('com_ui_stop')
    : durableReplySpeech && durableJob?.state === 'paused'
      ? localize('com_ui_resume')
      : localize('com_ui_read_aloud');
  if (voiceUnavailableReason) {
    title = localize('com_ui_read_aloud_unavailable', { 0: voiceUnavailableReason });
  }

  useEffect(() => {
    const messageAudio = document.getElementById(`audio-${messageId}`) as HTMLAudioElement | null;
    if (!messageAudio) {
      return;
    }
    if (playbackRate != null && playbackRate > 0 && messageAudio.playbackRate !== playbackRate) {
      messageAudio.playbackRate = playbackRate;
    }
  }, [audioRef, isSpeaking, playbackRate, messageId]);

  logger.log(
    'MessageAudio: audioRef.current?.src, audioRef.current',
    audioRef.current?.src,
    audioRef.current,
  );

  return (
    <>
      {renderButton ? (
        <>
          {renderButton({
            onClick: () => {
              if (voiceUnavailableReason) {
                return;
              }
              if (audioRef.current) {
                audioRef.current.muted = false;
              }
              toggleSpeech();
            },
            title,
            icon:
              durableReplySpeech && isSpeaking ? (
                <Pause size={18} />
              ) : durableReplySpeech && durableJob?.state === 'paused' ? (
                <Play size={18} />
              ) : (
                renderIcon()
              ),
            isActive: isSpeaking,
            isDisabled: Boolean(voiceUnavailableReason),
            className,
          })}
          {durableReplySpeech && durableJob && (
            <>
              {renderButton({
                onClick: previousParagraph,
                title: localize('com_ui_previous_paragraph'),
                icon: <SkipBack size={18} />,
                isDisabled: (durableJob.current_paragraph_index ?? 0) <= 0,
              })}
              {renderButton({
                onClick: stopSpeech,
                title: localize('com_ui_stop'),
                icon: <Square size={17} />,
                isDisabled: durableJob.state === 'cancelled',
              })}
              {renderButton({
                onClick: replaySpeech,
                title: localize('com_ui_replay'),
                icon: <RotateCcw size={18} />,
              })}
              {renderButton({
                onClick: nextParagraph,
                title: localize('com_ui_next_paragraph'),
                icon: <SkipForward size={18} />,
                isDisabled:
                  (durableJob.current_paragraph_index ?? 0) >=
                  Math.max((durableJob.paragraphs?.length ?? 1) - 1, 0),
              })}
            </>
          )}
        </>
      ) : (
        <button
          onClickCapture={() => {
            if (audioRef.current) {
              audioRef.current.muted = false;
            }
            toggleSpeech();
          }}
          type="button"
          title={isSpeaking === true ? localize('com_ui_stop') : localize('com_ui_read_aloud')}
        >
          {renderIcon()}
        </button>
      )}
      <audio
        ref={audioRef}
        controls
        preload="none"
        controlsList="nodownload nofullscreen noremoteplayback"
        style={{
          position: 'absolute',
          overflow: 'hidden',
          display: 'none',
          height: '0px',
          width: '0px',
        }}
        src={audioRef.current?.src}
        onError={(error) => {
          logger.error('Error fetching audio:', error);
        }}
        id={`audio-${messageId}`}
        autoPlay
      />
    </>
  );
}
