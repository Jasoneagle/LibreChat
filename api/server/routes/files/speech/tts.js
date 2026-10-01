const multer = require('multer');
const express = require('express');
const {
  inspectContent,
  extractStoredMessageContent,
  contentFilterBlockResponse,
  restoreTenantContextFromReq,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, hasActivePiiFields } = require('librechat-data-provider');
const { getVoices, streamAudio, textToSpeech } = require('~/server/services/Files/Audio');
const { ReplySpeechGateway } = require('~/server/services/Files/Audio/ReplySpeechGateway');
const { getLogStores } = require('~/cache');

const router = express.Router();
const upload = multer();

const replySpeechGateway = () => new ReplySpeechGateway();

const replySpeechError = (res, error) => {
  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  logger.error(`[replySpeech] ${error?.message ?? 'unknown_error'}`);
  return res.status(status).json({ error: error?.message ?? 'reply_speech_failed' });
};

router.post('/reply-job', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const result = await replySpeechGateway().createJob({
      messageId: req.body?.message_id,
      text: req.body?.text,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    replySpeechError(res, error);
  }
});

router.get('/reply-job/:jobId', async (req, res) => {
  try {
    res.status(200).json(await replySpeechGateway().readJob(req.params.jobId));
  } catch (error) {
    replySpeechError(res, error);
  }
});

router.post('/reply-job/:jobId/synthesize-next', async (req, res) => {
  try {
    res.status(200).json(await replySpeechGateway().synthesizeNext(req.params.jobId));
  } catch (error) {
    replySpeechError(res, error);
  }
});

router.post(
  '/reply-job/:jobId/playback-boundary',
  express.json({ limit: '4kb' }),
  async (req, res) => {
    try {
      res.status(200).json(
        await replySpeechGateway().confirmPlayback(req.params.jobId, {
          chunkIndex: req.body?.chunk_index,
          confirmedOffset: req.body?.confirmed_offset,
        }),
      );
    } catch (error) {
      replySpeechError(res, error);
    }
  },
);

router.get('/reply-job/:jobId/chunks/:chunkIndex/audio', async (req, res) => {
  try {
    const audio = await replySpeechGateway().readAudio(req.params.jobId, req.params.chunkIndex);
    res.setHeader('content-type', audio.contentType);
    res.setHeader('cache-control', 'private, no-store');
    if (audio.audioSha256) {
      res.setHeader('x-audio-sha256', audio.audioSha256);
    }
    res.status(200).send(audio.bytes);
  } catch (error) {
    replySpeechError(res, error);
  }
});

router.post(
  '/manual',
  upload.none(),
  restoreTenantContextFromReq,
  (req, res, next) => {
    const filters = req.config?.filters;
    if (!hasActivePiiFields(filters?.messages?.pii, ['text'])) {
      next();
      return;
    }

    const finding = inspectContent(extractStoredMessageContent({ text: req.body?.input }), {
      filters,
    });
    if (finding == null) {
      next();
      return;
    }

    res.status(400).json(contentFilterBlockResponse(finding));
  },
  async (req, res) => {
    await textToSpeech(req, res);
  },
);

const logDebugMessage = (req, message) =>
  logger.debug(`[streamAudio] user: ${req?.user?.id ?? 'UNDEFINED_USER'} | ${message}`);

// TODO: test caching
router.post('/', async (req, res) => {
  try {
    const audioRunsCache = getLogStores(CacheKeys.AUDIO_RUNS);
    const audioRun = await audioRunsCache.get(req.body.runId);
    logDebugMessage(req, 'start stream audio');
    if (audioRun) {
      logDebugMessage(req, 'stream audio already running');
      return res.status(401).json({ error: 'Audio stream already running' });
    }
    audioRunsCache.set(req.body.runId, true);
    await streamAudio(req, res);
    logDebugMessage(req, 'end stream audio');
    res.status(200).end();
  } catch (error) {
    logger.error(`[streamAudio] user: ${req.user.id} | Failed to stream audio: ${error}`);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

router.get('/voices', async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
