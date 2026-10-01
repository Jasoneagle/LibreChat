import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useTextToSpeechMutation, useVoicesQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import {
  confirmReplySpeechPlayback,
  createReplySpeechJob,
  fetchReplySpeechAudio,
  synthesizeNextReplySpeechChunk,
} from './replySpeechClient';
import store from '~/store';

const createFormData = (text: string, voice: string) => {
  const formData = new FormData();
  formData.append('input', text);
  formData.append('voice', voice);
  return formData;
};

type TUseTTSExternal = {
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  messageId?: string;
  isLast: boolean;
  index?: number;
  voiceOverride?: string | null;
  durableReplySpeech?: boolean;
};

function useTextToSpeechExternal({
  setIsSpeaking,
  audioRef,
  messageId,
  isLast,
  index = 0,
  voiceOverride,
  durableReplySpeech = false,
}: TUseTTSExternal) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const voice = useRecoilValue(store.voice);
  const cacheTTS = useRecoilValue(store.cacheTTS);
  const playbackRate = useRecoilValue(store.playbackRate);
  const { token } = useAuthContext();

  const [downloadFile, setDownloadFile] = useState(false);
  const [durableLoading, setDurableLoading] = useState(false);
  const selectedVoice = voiceOverride ?? voice ?? '';
  const cacheKey = (text: string) => `tts:${selectedVoice}:${text}`;

  const promiseAudioRef = useRef<HTMLAudioElement | null>(null);
  const durableAbortRef = useRef<AbortController | null>(null);

  /* Global Audio Variables */
  const globalIsFetching = useRecoilValue(store.globalAudioFetchingFamily(index));
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const autoPlayAudio = (blobUrl: string) => {
    const newAudio = new Audio(blobUrl);
    audioRef.current = newAudio;
  };

  const playAudioPromise = (blobUrl: string) => {
    const newAudio = new Audio(blobUrl);
    const initializeAudio = () => {
      if (playbackRate != null && playbackRate !== 1 && playbackRate > 0) {
        newAudio.playbackRate = playbackRate;
      }
    };

    initializeAudio();
    const playPromise = () => newAudio.play().then(() => setIsSpeaking(true));

    playPromise().catch((error: Error) => {
      if (
        error.message &&
        error.message.includes('The play() request was interrupted by a call to pause()')
      ) {
        console.log('Play request was interrupted by a call to pause()');
        initializeAudio();
        return playPromise().catch(console.error);
      }
      console.error(error);
      showToast({
        message: localize('com_nav_audio_play_error', { 0: error.message }),
        status: 'error',
      });
    });

    newAudio.onended = () => {
      console.log('Cached message audio ended');
      URL.revokeObjectURL(blobUrl);
      setIsSpeaking(false);
    };

    promiseAudioRef.current = newAudio;
  };

  const downloadAudio = (blobUrl: string) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'audio.mp3';
    a.click();
    setDownloadFile(false);
  };

  const { mutate: processAudio, isLoading } = useTextToSpeechMutation({
    onMutate: (variables) => {
      const inputText = (variables.get('input') ?? '') as string;
      if (inputText.length >= 4096) {
        showToast({
          message: localize('com_nav_long_audio_warning'),
          status: 'warning',
        });
      }
    },
    onSuccess: async (data: ArrayBuffer, variables) => {
      try {
        const inputText = (variables.get('input') ?? '') as string;
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });

        if (cacheTTS && inputText) {
          const cache = await caches.open('tts-responses');
          const request = new Request(cacheKey(inputText));
          const response = new Response(audioBlob);
          cache.put(request, response);
        }

        const blobUrl = URL.createObjectURL(audioBlob);
        if (downloadFile) {
          downloadAudio(blobUrl);
        }
        autoPlayAudio(blobUrl);
      } catch (error) {
        showToast({
          message: `Error processing audio: ${(error as Error).message}`,
          status: 'error',
        });
      }
    },
    onError: (error: unknown) => {
      showToast({
        message: localize('com_nav_audio_process_error', { 0: (error as Error).message }),
        status: 'error',
      });
    },
  });

  const startMutation = (text: string, download: boolean) => {
    const formData = createFormData(text, selectedVoice);
    setDownloadFile(download);
    processAudio(formData);
  };

  const playDurableAudio = (audioBlob: Blob, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const blobUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(blobUrl);
      if (playbackRate != null && playbackRate > 0) {
        audio.playbackRate = playbackRate;
      }
      audioRef.current = audio;
      promiseAudioRef.current = audio;
      let settled = false;
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        audio.onended = null;
        audio.onerror = null;
        URL.revokeObjectURL(blobUrl);
      };
      const abort = () => {
        if (settled) {
          return;
        }
        settled = true;
        audio.pause();
        cleanup();
        reject(new DOMException('Reply speech stopped', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      audio.onended = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error('reply_speech_audio_playback_failed'));
      };
      audio
        .play()
        .then(() => setIsSpeaking(true))
        .catch((error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        });
    });

  const generateDurableReplySpeech = async (text: string) => {
    if (!messageId) {
      throw new Error('reply_speech_message_id_required');
    }
    durableAbortRef.current?.abort();
    const controller = new AbortController();
    durableAbortRef.current = controller;
    setDurableLoading(true);
    try {
      let { job } = await createReplySpeechJob(token, messageId, text, controller.signal);
      const startIndex = job.next_chunk_index >= job.chunks.length ? 0 : job.next_chunk_index;
      for (let chunkIndex = startIndex; chunkIndex < job.chunks.length; chunkIndex += 1) {
        if (!job.chunks[chunkIndex].audio_sha256) {
          ({ job } = await synthesizeNextReplySpeechChunk(token, job.job_id, controller.signal));
        }
        const chunk = job.chunks[chunkIndex];
        const audioBlob = await fetchReplySpeechAudio(
          token,
          job.job_id,
          chunk.index,
          chunk.audio_sha256 ?? '',
          controller.signal,
        );
        setDurableLoading(false);
        await playDurableAudio(audioBlob, controller.signal);
        job = await confirmReplySpeechPlayback(token, job.job_id, chunk, controller.signal);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        showToast({
          message: `Read aloud failed: ${(error as Error).message}`,
          status: 'error',
        });
      }
    } finally {
      if (durableAbortRef.current === controller) {
        durableAbortRef.current = null;
      }
      setDurableLoading(false);
      setIsSpeaking(false);
    }
  };

  const generateSpeechExternal = (text: string, download: boolean) => {
    if (durableReplySpeech) {
      void generateDurableReplySpeech(text);
      return;
    }
    if (cacheTTS) {
      handleCachedResponse(text, download);
    } else {
      startMutation(text, download);
    }
  };

  const handleCachedResponse = async (text: string, download: boolean) => {
    const cachedResponse = await caches.match(cacheKey(text));
    if (!cachedResponse) {
      return startMutation(text, download);
    }
    const audioBlob = await cachedResponse.blob();
    const blobUrl = URL.createObjectURL(audioBlob);
    if (download) {
      downloadAudio(blobUrl);
    } else {
      playAudioPromise(blobUrl);
    }
  };

  const cancelSpeech = () => {
    durableAbortRef.current?.abort();
    durableAbortRef.current = null;
    const messageAudio = document.getElementById(`audio-${messageId}`) as HTMLAudioElement | null;
    const pauseAudio = (currentElement: HTMLAudioElement | null) => {
      if (currentElement) {
        currentElement.pause();
        currentElement.src && URL.revokeObjectURL(currentElement.src);
        audioRef.current = null;
      }
    };
    pauseAudio(messageAudio);
    pauseAudio(promiseAudioRef.current);
    setIsSpeaking(false);
  };

  const cancelPromiseSpeech = useCallback(() => {
    if (promiseAudioRef.current) {
      promiseAudioRef.current.pause();
      promiseAudioRef.current.src && URL.revokeObjectURL(promiseAudioRef.current.src);
      promiseAudioRef.current = null;
      setIsSpeaking(false);
    }
  }, [setIsSpeaking]);

  useEffect(() => cancelPromiseSpeech, [cancelPromiseSpeech]);

  useEffect(
    () => () => {
      durableAbortRef.current?.abort();
    },
    [],
  );

  const isFetching = useMemo(
    () => isLast && globalIsFetching && !globalIsPlaying,
    [globalIsFetching, globalIsPlaying, isLast],
  );

  const { data: voicesData = [] } = useVoicesQuery();

  return {
    generateSpeechExternal,
    cancelSpeech,
    isLoading: isFetching || isLoading || durableLoading,
    audioRef,
    voices: voicesData,
  };
}

export default useTextToSpeechExternal;
