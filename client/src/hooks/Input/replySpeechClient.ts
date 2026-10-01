export type ReplySpeechChunk = {
  index: number;
  start: number;
  end: number;
  audio_sha256?: string | null;
};

export type ReplySpeechJob = {
  job_id: string;
  next_chunk_index: number;
  chunks: ReplySpeechChunk[];
};

type JobEnvelope = { job: ReplySpeechJob };

const SHA256 = /^[a-f0-9]{64}$/i;

const sha256Hex = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const request = async <T>(
  url: string,
  token: string | undefined,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      ...(options.body == null ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = `reply_speech_http_${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error || message;
    } catch {
      // Keep the status-derived error; no response body is required.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
};

export const createReplySpeechJob = async (
  token: string | undefined,
  messageId: string,
  text: string,
  signal?: AbortSignal,
) =>
  request<JobEnvelope>('/api/files/speech/tts/reply-job', token, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId, text }),
    signal,
  });

export const synthesizeNextReplySpeechChunk = async (
  token: string | undefined,
  jobId: string,
  signal?: AbortSignal,
) =>
  request<JobEnvelope>(`/api/files/speech/tts/reply-job/${jobId}/synthesize-next`, token, {
    method: 'POST',
    body: '{}',
    signal,
  });

export const fetchReplySpeechAudio = async (
  token: string | undefined,
  jobId: string,
  chunkIndex: number,
  expectedAudioSha256: string,
  signal?: AbortSignal,
) => {
  const response = await fetch(
    `/api/files/speech/tts/reply-job/${jobId}/chunks/${chunkIndex}/audio`,
    { headers: { Authorization: `Bearer ${token ?? ''}` }, signal },
  );
  if (!response.ok) {
    throw new Error(`reply_speech_audio_http_${response.status}`);
  }
  const recordedAudioSha256 = response.headers.get('x-audio-sha256') ?? '';
  if (!SHA256.test(expectedAudioSha256) || recordedAudioSha256 !== expectedAudioSha256) {
    throw new Error('reply_speech_audio_identity_mismatch');
  }
  const bytes = await response.arrayBuffer();
  if ((await sha256Hex(bytes)) !== expectedAudioSha256) {
    throw new Error('reply_speech_audio_identity_mismatch');
  }
  return new Blob([bytes], {
    type: response.headers.get('content-type') || 'audio/mpeg',
  });
};

export const confirmReplySpeechPlayback = async (
  token: string | undefined,
  jobId: string,
  chunk: ReplySpeechChunk,
  signal?: AbortSignal,
) =>
  request<ReplySpeechJob>(`/api/files/speech/tts/reply-job/${jobId}/playback-boundary`, token, {
    method: 'POST',
    body: JSON.stringify({
      chunk_index: chunk.index,
      confirmed_offset: chunk.end - chunk.start,
    }),
    signal,
  });
