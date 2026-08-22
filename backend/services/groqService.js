import Groq from 'groq-sdk';
import { Readable } from 'stream';
import { File } from 'node:buffer';

const SUPPORTED_FORMATS = [
  'audio/flac', 'audio/mp3', 'audio/mpeg', 'audio/mpga',
  'audio/m4a', 'audio/mp4', 'audio/ogg', 'audio/wav',
  'audio/webm', 'audio/x-m4a', 'audio/x-wav',
  'video/mp4', 'video/mpeg', 'video/ogg', 'video/webm'
];

const SUPPORTED_EXTENSIONS = [
  '.flac', '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a',
  '.ogg', '.wav', '.webm'
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB Groq limit

/**
 * Validate an uploaded audio file before sending to Groq.
 * Returns { valid: true } or { valid: false, reason: string }
 */
export function validateAudioFile(file) {
  if (!file) {
    return { valid: false, reason: 'No audio file provided.' };
  }

  if (file.size === 0) {
    return { valid: false, reason: 'The uploaded file is empty.' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      reason: `File too large (${sizeMB} MB). Maximum allowed size is 25 MB.`
    };
  }

  const ext = '.' + file.originalname.split('.').pop().toLowerCase();
  const mimeOk = SUPPORTED_FORMATS.includes(file.mimetype);
  const extOk = SUPPORTED_EXTENSIONS.includes(ext);

  if (!mimeOk && !extOk) {
    return {
      valid: false,
      reason: `Unsupported file format "${file.mimetype}". Supported: MP3, WAV, M4A, FLAC, OGG, WEBM, MP4.`
    };
  }

  return { valid: true };
}

/**
 * Transcribe audio using Groq Whisper.
 * @param {Buffer} fileBuffer - The actual audio file bytes
 * @param {string} filename - Original filename (for format detection)
 * @returns {Promise<string>} The transcript text
 */
export async function transcribeAudio(fileBuffer, filename) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured. Please set it in your .env file.');
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Convert Buffer to a File-like object that Groq SDK accepts
  const file = new File([fileBuffer], filename, { type: 'audio/' + filename.split('.').pop() });
    // Groq SDK uses this to determine content-type

  let transcription;
  try {
    transcription = await client.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
    });
  } catch (err) {
    // Surface meaningful errors
    if (err.status === 401) {
      throw new Error('Invalid Groq API key. Please check your GROQ_API_KEY.');
    }
    if (err.status === 429) {
      throw new Error('Groq API rate limit exceeded. Please wait a moment and try again.');
    }
    if (err.status === 400) {
      throw new Error(`Groq rejected the audio file: ${err.message || 'unsupported or corrupted format'}.`);
    }
    throw new Error(`Groq transcription failed: ${err.message || 'Unknown error'}`);
  }

  const text = transcription?.text?.trim();

  if (!text) {
    throw new Error(
      'Groq returned an empty transcript. The audio may be silent, inaudible, or in an unsupported language.'
    );
  }

  return text;
}
