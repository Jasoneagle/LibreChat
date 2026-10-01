const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:4317';
const JOB_ID = /^[a-f0-9]{64}$/i;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

const requireJobId = (jobId) => {
  if (!JOB_ID.test(String(jobId ?? ''))) {
    throw new Error('speech_job_id_invalid');
  }
  return jobId;
};

const requireChunkIndex = (chunkIndex) => {
  const value = Number(chunkIndex);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('speech_chunk_index_invalid');
  }
  return value;
};

const readBoundedBody = async (response, maximumBytes) => {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximumBytes) {
    throw new Error('speech_gateway_response_too_large');
  }
  return bytes;
};

class ReplySpeechGateway {
  constructor({
    baseUrl = process.env.LIBRECHAT_GATEWAY_URL || DEFAULT_GATEWAY_URL,
    apiKey = process.env.LIBRECHAT_GATEWAY_API_KEY,
    fetchImpl = global.fetch,
  } = {}) {
    const parsed = new URL(baseUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
      throw new Error('speech_gateway_must_be_loopback');
    }
    if (typeof apiKey !== 'string' || !apiKey) {
      throw new Error('speech_gateway_api_key_required');
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('speech_gateway_fetch_required');
    }
    this.baseUrl = parsed.origin;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async requestJson(path, { method = 'GET', body } = {}) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body == null ? {} : { 'content-type': 'application/json' }),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
    const bytes = await readBoundedBody(response, MAX_JSON_BYTES);
    let result = {};
    if (bytes.length) {
      try {
        result = JSON.parse(bytes.toString('utf8'));
      } catch {
        throw new Error('speech_gateway_invalid_json');
      }
    }
    if (!response.ok) {
      const error = new Error(result.error || `speech_gateway_http_${response.status}`);
      error.status = response.status;
      error.details = result;
      throw error;
    }
    return result;
  }

  createJob({ messageId, text }) {
    if (typeof messageId !== 'string' || !messageId || typeof text !== 'string' || !text) {
      throw new Error('speech_message_and_text_required');
    }
    return this.requestJson('/v1/speech/jobs', {
      method: 'POST',
      body: { message_id: messageId, text },
    });
  }

  readJob(jobId) {
    return this.requestJson(`/v1/speech/jobs/${requireJobId(jobId)}`);
  }

  synthesizeNext(jobId) {
    return this.requestJson(`/v1/speech/jobs/${requireJobId(jobId)}/synthesize-next`, {
      method: 'POST',
      body: {},
    });
  }

  confirmPlayback(jobId, { chunkIndex, confirmedOffset }) {
    const normalizedChunkIndex = requireChunkIndex(chunkIndex);
    if (!Number.isInteger(confirmedOffset) || confirmedOffset < 0) {
      throw new Error('speech_playback_offset_invalid');
    }
    return this.requestJson(`/v1/speech/jobs/${requireJobId(jobId)}/playback-boundary`, {
      method: 'POST',
      body: { chunk_index: normalizedChunkIndex, confirmed_offset: confirmedOffset },
    });
  }

  async readAudio(jobId, chunkIndex) {
    const response = await this.fetch(
      `${this.baseUrl}/v1/speech/jobs/${requireJobId(jobId)}/chunks/${requireChunkIndex(chunkIndex)}/audio`,
      { headers: { authorization: `Bearer ${this.apiKey}` } },
    );
    const bytes = await readBoundedBody(response, MAX_AUDIO_BYTES);
    if (!response.ok) {
      const error = new Error(`speech_gateway_http_${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!bytes.length) {
      throw new Error('speech_gateway_empty_audio');
    }
    return {
      bytes,
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      audioSha256: response.headers.get('x-audio-sha256') || null,
    };
  }
}

module.exports = { ReplySpeechGateway };
