import { webcrypto } from 'node:crypto';
import {
  createReplySpeechJob,
  fetchReplySpeechAudio,
  synthesizeNextReplySpeechChunk,
} from './replySpeechClient';

const sha256Hex = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

describe('replySpeechClient', () => {
  const originalCrypto = globalThis.crypto;
  const originalFetch = globalThis.fetch;

  const installFetch = (fetchMock: jest.Mock) => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    return fetchMock;
  };

  const exactArrayBuffer = (bytes: Uint8Array) =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: webcrypto as unknown as Crypto,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  });

  it('creates and advances one authenticated exact-reply job', async () => {
    const job = { job_id: 'a'.repeat(64), next_chunk_index: 0, chunks: [] };
    const fetchMock = installFetch(
      jest
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ job }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ job }) }),
    );

    await createReplySpeechJob('jwt', 'message-1', 'Only this reply.');
    await synthesizeNextReplySpeechChunk('jwt', job.job_id);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/files/speech/tts/reply-job',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt' }),
        body: JSON.stringify({ message_id: 'message-1', text: 'Only this reply.' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/files/speech/tts/reply-job/${job.job_id}/synthesize-next`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('accepts audio only when the header and bytes match the recorded chunk hash', async () => {
    const bytes = new Uint8Array(Buffer.from('verified-audio'));
    const audioSha256 = await sha256Hex(bytes);
    installFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            ({ 'content-type': 'audio/mpeg', 'x-audio-sha256': audioSha256 })[
              name.toLowerCase() as 'content-type' | 'x-audio-sha256'
            ] ?? null,
        },
        arrayBuffer: async () => exactArrayBuffer(bytes),
      }),
    );

    const blob = await fetchReplySpeechAudio('jwt', 'a'.repeat(64), 0, audioSha256);

    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBe(bytes.byteLength);
  });

  it('rejects audio when either the response header or bytes drift', async () => {
    const bytes = new Uint8Array(Buffer.from('drifted-audio'));
    const expectedSha256 = await sha256Hex(new Uint8Array(Buffer.from('expected-audio')));
    installFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            ({ 'content-type': 'audio/mpeg', 'x-audio-sha256': expectedSha256 })[
              name.toLowerCase() as 'content-type' | 'x-audio-sha256'
            ] ?? null,
        },
        arrayBuffer: async () => exactArrayBuffer(bytes),
      }),
    );

    await expect(fetchReplySpeechAudio('jwt', 'a'.repeat(64), 0, expectedSha256)).rejects.toThrow(
      'reply_speech_audio_identity_mismatch',
    );
  });
});
