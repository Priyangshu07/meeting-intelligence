/**
 * main.js — Meeting Intelligence frontend entry point
 * Wires up all events and orchestrates the upload → process → display flow.
 */

import {
  uploadMeeting,
  fetchMeetings,
  fetchMeeting,
  deleteMeeting,
} from './api.js';

import {
  showView,
  setProcessingStep,
  setProcessingMessage,
  renderResults,
  renderHistory,
  showToast,
  copyToClipboard,
  buildExportText,
  formatFileSize,
  formatFileType,
} from './ui.js';

/* ── State ── */
let selectedFile = null;       // The real browser File object
let currentResult = null;      // The last successfully analyzed meeting

/* ── DOM refs ── */
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('audio-file-input');
const fileSelected  = document.getElementById('file-selected');
const fileNameEl    = document.getElementById('file-name');
const fileMetaEl    = document.getElementById('file-meta');
const fileRemoveBtn = document.getElementById('file-remove-btn');
const analyzeBtn    = document.getElementById('analyze-btn');

const navUploadBtn  = document.getElementById('nav-upload-btn');
const navHistoryBtn = document.getElementById('nav-history-btn');

const retryBtn      = document.getElementById('retry-btn');
const newMeetingBtn = document.getElementById('new-meeting-btn');
const historyUploadBtn = document.getElementById('history-upload-btn');

const copyAllBtn    = document.getElementById('copy-all-btn');
const downloadBtn   = document.getElementById('download-btn');

const toggleTranscriptBtn  = document.getElementById('toggle-transcript-btn');
const toggleTranscriptLabel = document.getElementById('toggle-transcript-label');
const toggleChevron        = document.getElementById('toggle-chevron');
const transcriptWrapper    = document.getElementById('transcript-wrapper');
const transcriptCopyBtn    = document.getElementById('transcript-copy-btn');

/* ── Init ── */
showView('upload-view');

/* ─────────────────────────────────────────────
   DROP ZONE — drag & drop + click to open
   ───────────────────────────────────────────── */

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) handleFileSelection(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelection(fileInput.files[0]);
});

fileRemoveBtn.addEventListener('click', clearFileSelection);

function handleFileSelection(file) {
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = `${formatFileSize(file.size)} · ${formatFileType(file.type)}`;
  fileSelected.hidden = false;

  // Reset the file input so the same file can be re-selected if needed
  fileInput.value = '';
}

function clearFileSelection() {
  selectedFile = null;
  fileSelected.hidden = true;
  fileNameEl.textContent = '';
  fileMetaEl.textContent = '';
  fileInput.value = '';
}

/* ─────────────────────────────────────────────
   ANALYZE — full pipeline
   ───────────────────────────────────────────── */

analyzeBtn.addEventListener('click', startAnalysis);

async function startAnalysis() {
  if (!selectedFile) {
    showToast('Please select an audio file first.', 'error');
    return;
  }

  // Show processing view
  showView('processing-view');
  setProcessingStep('step-upload');
  setProcessingMessage('Uploading audio…', 'Sending your file to the server');

  // Small delay so the UI updates are visible
  await sleep(300);

  let result;
  try {
    setProcessingStep('step-transcribe');
    setProcessingMessage('Transcribing with Groq…', 'Whisper large-v3-turbo is processing your audio');

    // This single call covers upload → transcribe → analyze on the backend
    // (the backend reports stages through its own logs; we animate the UI here)
    const uploadPromise = uploadMeeting(selectedFile);

    // After another delay, advance to the analyze step
    await sleep(2500);
    setProcessingStep('step-analyze');
    setProcessingMessage('Analyzing with Gemini…', 'Extracting summary, decisions, and action items');

    result = await uploadPromise;

    setProcessingStep('step-complete');
    setProcessingMessage('Complete!', 'Your meeting intelligence is ready');
    await sleep(400);

  } catch (err) {
    // Real error — show error view
    showError(err);
    return;
  }

  // Store result and render
  currentResult = result;
  renderResults(result);
  showView('results-view');
  clearFileSelection();
}

/* ─────────────────────────────────────────────
   ERROR VIEW
   ───────────────────────────────────────────── */

function showError(err) {
  const titleEl   = document.getElementById('error-title');
  const msgEl     = document.getElementById('error-message');
  const stageWrap = document.getElementById('error-stage-wrapper');
  const stageBadge = document.getElementById('error-stage-badge');
  const partialWrap = document.getElementById('partial-transcript-wrapper');
  const errorTranscript = document.getElementById('error-transcript');

  titleEl.textContent = err.stage === 'analysis'
    ? 'Analysis Failed'
    : err.stage === 'transcription'
    ? 'Transcription Failed'
    : 'Something Went Wrong';

  msgEl.textContent = err.message || 'An unexpected error occurred. Please try again.';

  if (err.stage) {
    stageWrap.hidden = false;
    stageBadge.textContent = err.stage;
  } else {
    stageWrap.hidden = true;
  }

  // If transcription succeeded but analysis failed, show transcript
  if (err.transcript) {
    partialWrap.hidden = false;
    errorTranscript.textContent = err.transcript;
  } else {
    partialWrap.hidden = true;
  }

  showView('error-view');
}

retryBtn.addEventListener('click', () => {
  showView('upload-view');
});

/* ─────────────────────────────────────────────
   NAVIGATION
   ───────────────────────────────────────────── */

navUploadBtn.addEventListener('click', () => {
  navUploadBtn.classList.add('active');
  navHistoryBtn.classList.remove('active');
  showView('upload-view');
});

navHistoryBtn.addEventListener('click', () => {
  navHistoryBtn.classList.add('active');
  navUploadBtn.classList.remove('active');
  loadHistory();
});

newMeetingBtn?.addEventListener('click', () => {
  navUploadBtn.classList.add('active');
  navHistoryBtn.classList.remove('active');
  showView('upload-view');
});

historyUploadBtn?.addEventListener('click', () => {
  navUploadBtn.classList.add('active');
  navHistoryBtn.classList.remove('active');
  showView('upload-view');
});

/* ─────────────────────────────────────────────
   HISTORY
   ───────────────────────────────────────────── */

async function loadHistory() {
  showView('history-view');
  const loading = document.getElementById('history-loading');
  const empty   = document.getElementById('history-empty');
  const list    = document.getElementById('history-list');

  loading.hidden = false;
  empty.hidden = true;
  list.innerHTML = '';

  try {
    const meetings = await fetchMeetings();
    renderHistory(meetings, openHistoryItem, removeHistoryItem);
  } catch (err) {
    loading.hidden = true;
    showToast('Failed to load meeting history.', 'error');
  }
}

async function openHistoryItem(id) {
  try {
    const meeting = await fetchMeeting(id);
    if (meeting.status !== 'completed') {
      showToast('This meeting did not complete successfully.', 'error');
      return;
    }
    currentResult = meeting;
    renderResults(meeting);
    showView('results-view');
    navUploadBtn.classList.add('active');
    navHistoryBtn.classList.remove('active');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeHistoryItem(id, itemEl) {
  try {
    await deleteMeeting(id);
    itemEl.style.opacity = '0';
    itemEl.style.transform = 'translateX(20px)';
    itemEl.style.transition = 'all 0.25s ease';
    setTimeout(() => itemEl.remove(), 250);
    showToast('Meeting deleted.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ─────────────────────────────────────────────
   RESULTS ACTIONS
   ───────────────────────────────────────────── */

copyAllBtn?.addEventListener('click', async () => {
  if (!currentResult) return;
  const text = buildExportText(currentResult);
  const ok = await copyToClipboard(text);
  if (ok) showToast('Copied to clipboard!', 'success');
  else showToast('Copy failed. Please try manually.', 'error');
});

downloadBtn?.addEventListener('click', () => {
  if (!currentResult) return;
  const text = buildExportText(currentResult);
  const safeName = (currentResult.filename || 'meeting')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}_intelligence.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Downloaded!', 'success');
});

/* ─────────────────────────────────────────────
   TRANSCRIPT TOGGLE
   ───────────────────────────────────────────── */

let transcriptVisible = false;

toggleTranscriptBtn?.addEventListener('click', () => {
  transcriptVisible = !transcriptVisible;
  transcriptWrapper.hidden = !transcriptVisible;
  toggleTranscriptLabel.textContent = transcriptVisible ? 'Hide' : 'Show';
  toggleChevron.classList.toggle('open', transcriptVisible);
});

transcriptCopyBtn?.addEventListener('click', async () => {
  const text = document.getElementById('transcript-text').textContent;
  const ok = await copyToClipboard(text);
  if (ok) showToast('Transcript copied!', 'success');
});

/* ─────────────────────────────────────────────
   UTIL
   ───────────────────────────────────────────── */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
