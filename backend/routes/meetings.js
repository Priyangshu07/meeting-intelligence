import express from 'express';
import multer from 'multer';
import { validateAudioFile, transcribeAudio } from '../services/groqService.js';
import { analyzeMeeting } from '../services/geminiService.js';
import {
  createMeeting,
  updateMeetingSuccess,
  updateMeetingError,
  getAllMeetings,
  getMeetingById,
  deleteMeeting,
} from '../services/storageService.js';

const router = express.Router();

// Multer: store file in memory so we can pass raw bytes to Groq
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 26 * 1024 * 1024, // 26 MB hard limit (Groq max is 25 MB)
  },
  fileFilter: (_req, file, cb) => {
    // Accept all audio/video MIME types; further validation in the route
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      // Some browsers send wrong MIME type; accept by extension and validate later
      const ext = '.' + file.originalname.split('.').pop().toLowerCase();
      const allowed = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.mp4', '.mpeg', '.mpga'];
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    }
  },
});

/**
 * POST /api/meetings/upload
 * Full pipeline: upload → validate → transcribe → analyze → persist
 */
router.post('/upload', upload.single('audio'), async (req, res) => {
  // 1. Validate file presence and basic properties
  const validation = validateAudioFile(req.file);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason });
  }

  const { originalname, size, mimetype, buffer } = req.file;

  // 2. Create meeting record in DB (status: processing)
  let meetingId;
  try {
    meetingId = createMeeting({
      filename: originalname,
      file_size: size,
      file_type: mimetype,
    });
  } catch (dbErr) {
    console.error('[DB] Failed to create meeting record:', dbErr);
    return res.status(500).json({ error: 'Internal storage error. Please try again.' });
  }

  let transcript = null;

  // 3. Transcribe with Groq ASR
  try {
    console.log(`[Groq] Transcribing "${originalname}" (${(size / 1024).toFixed(1)} KB)...`);
    transcript = await transcribeAudio(buffer, originalname);
    console.log(`[Groq] Transcription complete — ${transcript.length} characters`);
  } catch (asrErr) {
    console.error('[Groq] Transcription failed:', asrErr.message);
    updateMeetingError(meetingId, {
      error_message: asrErr.message,
      status: 'transcription_failed',
    });
    return res.status(502).json({
      meetingId,
      error: 'Transcription failed.',
      details: asrErr.message,
      stage: 'transcription',
    });
  }

  // 4. Analyze with Gemini LLM
  let analysis;
  try {
    console.log(`[Gemini] Analyzing transcript (${transcript.length} chars)...`);
    analysis = await analyzeMeeting(transcript);
    console.log('[Gemini] Analysis complete');
  } catch (llmErr) {
    console.error('[Gemini] Analysis failed:', llmErr.message);
    // Save the transcript even if analysis failed
    updateMeetingError(meetingId, {
      error_message: llmErr.message,
      transcript,
      status: 'analysis_failed',
    });
    return res.status(502).json({
      meetingId,
      error: 'The transcript was generated, but meeting analysis failed.',
      details: llmErr.message,
      transcript,
      stage: 'analysis',
    });
  }

  // 5. Persist successful results
  try {
    updateMeetingSuccess(meetingId, {
      transcript,
      summary: analysis.summary,
      key_points: analysis.key_points,
      decisions: analysis.decisions,
      action_items: analysis.action_items,
    });
  } catch (dbErr) {
    console.error('[DB] Failed to save results:', dbErr);
    // Still return results to client even if persist failed
  }

  // 6. Return complete result
  return res.status(200).json({
    meetingId,
    filename: originalname,
    file_size: size,
    transcript,
    summary: analysis.summary,
    key_points: analysis.key_points,
    decisions: analysis.decisions,
    action_items: analysis.action_items,
    created_at: new Date().toISOString(),
  });
});

/**
 * GET /api/meetings
 * List all processed meetings (history)
 */
router.get('/', (_req, res) => {
  try {
    const meetings = getAllMeetings();
    return res.json(meetings);
  } catch (err) {
    console.error('[DB] Failed to fetch meetings:', err);
    return res.status(500).json({ error: 'Failed to fetch meeting history.' });
  }
});

/**
 * GET /api/meetings/:id
 * Get a single meeting with full details
 */
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid meeting ID.' });
  }

  try {
    const meeting = getMeetingById(id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }
    return res.json(meeting);
  } catch (err) {
    console.error('[DB] Failed to fetch meeting:', err);
    return res.status(500).json({ error: 'Failed to fetch meeting.' });
  }
});

/**
 * DELETE /api/meetings/:id
 * Remove a meeting from history
 */
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid meeting ID.' });
  }

  try {
    const meeting = getMeetingById(id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }
    deleteMeeting(id);
    return res.json({ success: true, message: 'Meeting deleted.' });
  } catch (err) {
    console.error('[DB] Failed to delete meeting:', err);
    return res.status(500).json({ error: 'Failed to delete meeting.' });
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum allowed size is 25 MB.' });
  }
  return res.status(400).json({ error: err.message || 'File upload error.' });
});

export default router;
