const { ReplySpeechGateway } = require('./ReplySpeechGateway');

const JOB_ID = 'a'.repeat(64);

const response = (body, { status = 200, contentType = 'application/json', headers = {} } = {}) =>
  new Response(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType, ...headers },
  });

describe('ReplySpeechGateway', () => {
  it('keeps the gateway credential server-side while creating an exact-message job', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({ created: true, job: { job_id: JOB_ID } }));
    const gateway = new ReplySpeechGateway({ apiKey: 'secret-key', fetchImpl });

    const result = await gateway.createJob({ messageId: 'message-1', text: 'Only this reply.' });

    expect(result.job.job_id).toBe(JOB_ID);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4317/v1/speech/jobs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
        body: JSON.stringify({ message_id: 'message-1', text: 'Only this reply.' }),
      }),
    );
  });

  it('rejects remote gateway addresses and malformed identifiers', async () => {
    expect(() => new ReplySpeechGateway({ baseUrl: 'https://example.com', apiKey: 'key' })).toThrow(
      'speech_gateway_must_be_loopback',
    );
    const gateway = new ReplySpeechGateway({ apiKey: 'key', fetchImpl: jest.fn() });
    expect(() => gateway.readJob('../secret')).toThrow('speech_job_id_invalid');
    await expect(gateway.readAudio(JOB_ID, -1)).rejects.toThrow('speech_chunk_index_invalid');
  });

  it('returns bounded verified audio without exposing its credential', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      response(Buffer.from('audio-bytes'), {
        contentType: 'audio/mpeg',
        headers: { 'x-audio-sha256': 'b'.repeat(64) },
      }),
    );
    const gateway = new ReplySpeechGateway({ apiKey: 'secret-key', fetchImpl });

    const result = await gateway.readAudio(JOB_ID, 0);

    expect(result.bytes.toString()).toBe('audio-bytes');
    expect(result.audioSha256).toBe('b'.repeat(64));
    expect(fetchImpl.mock.calls[0][0]).not.toContain('secret-key');
  });

  it('preserves gateway rejection status and safe error identity', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response({ error: 'speech_voice_profile_not_approved' }, { status: 422 }));
    const gateway = new ReplySpeechGateway({ apiKey: 'key', fetchImpl });

    await expect(gateway.createJob({ messageId: 'message-1', text: 'Text' })).rejects.toMatchObject(
      {
        message: 'speech_voice_profile_not_approved',
        status: 422,
      },
    );
  });
});
