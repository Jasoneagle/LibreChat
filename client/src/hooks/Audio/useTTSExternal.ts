// AI-system attribution: OpenAI Codex desktop (OpenAI); reported model gpt-6.1-sol;
// task 01a0aca7-f6db-7543-8cf3-1d1e646a47ab; ACT1250; 2026-10-17.
// client/src/hooks/Audio/useTTSExternal.ts
import { useRef, useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import useTextToSpeechExternal from '~/hooks/Input/useTextToSpeechExternal';
import usePauseGlobalAudio from '~/hooks/Audio/usePauseGlobalAudio';
import useAudioRef from '~/hooks/Audio/useAudioRef';
import { logger } from '~/utils';
import store from '~/store';

type TUseTextToSpeech = {
  messageId?: string;
  content?: TMessageContentParts[] | string;
  isLast?: boolean;
  index?: number;
  voiceOverride?: string | null;
  durableReplySpeech?: boolean;
};

const useTTSExternal = (props?: TUseTextToSpeech) => {
  const {
    messageId,
    content,
    isLast = false,
    index = 0,
    voiceOverride,
    durableReplySpeech,
  } = props ?? {};

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const [isSpeakingState, setIsSpeaking] = useState(false);
  const { audioRef } = useAudioRef({ setIsPlaying: setIsSpeaking });

  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const [voice, setVoice] = useRecoilState(store.voice);
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const isSpeaking = isSpeakingState || (isLast && globalIsPlaying);
  const {
    cancelSpeech,
    generateSpeechExternal: generateSpeech,
    isLoading,
    voices,
    durableJob,
    pauseDurableSpeech,
    replayDurableSpeech,
    navigateDurableSpeechParagraph,
  } = useTextToSpeechExternal({
    setIsSpeaking,
    audioRef,
    messageId,
    isLast,
    index,
    voiceOverride,
    durableReplySpeech,
  });

  useEffect(() => {
    const firstVoice = voices[0];
    if (voices.length) {
      const lastSelectedVoice = voices.find((v) => v === voice);
      if (lastSelectedVoice != null) {
        logger.log('useTextToSpeech.ts - Effect:', { voices, voice: lastSelectedVoice });
        setVoice(lastSelectedVoice.toString());
        return;
      }
      logger.log('useTextToSpeech.ts - Effect:', { voices, voice: firstVoice });
      setVoice(firstVoice.toString());
    }
  }, [setVoice, voice, voices]);

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        const messageContent = content ?? '';
        const parsedMessage =
          typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
        generateSpeech(parsedMessage, false);
      }
    }, 1000);
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
  };

  const toggleSpeech = () => {
    if (isSpeaking === true || (durableReplySpeech && isLoading)) {
      if (durableReplySpeech) {
        void pauseDurableSpeech().catch((error) =>
          logger.error('Failed to pause reply speech', error),
        );
      } else {
        cancelSpeech();
      }
      pauseGlobalAudio();
    } else {
      const messageContent = content ?? '';
      const parsedMessage =
        typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
      generateSpeech(parsedMessage, false);
    }
  };

  const parsedContent = () => {
    const messageContent = content ?? '';
    return typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
  };

  const replaySpeech = () =>
    void replayDurableSpeech(parsedContent()).catch((error) =>
      logger.error('Failed to replay reply speech', error),
    );
  const previousParagraph = () =>
    void navigateDurableSpeechParagraph(parsedContent(), -1).catch((error) =>
      logger.error('Failed to select previous reply paragraph', error),
    );
  const nextParagraph = () =>
    void navigateDurableSpeechParagraph(parsedContent(), 1).catch((error) =>
      logger.error('Failed to select next reply paragraph', error),
    );

  return {
    handleMouseDown,
    handleMouseUp,
    toggleSpeech,
    isSpeaking,
    isLoading,
    audioRef,
    voices,
    durableJob,
    stopSpeech: cancelSpeech,
    replaySpeech,
    previousParagraph,
    nextParagraph,
  };
};

export default useTTSExternal;
