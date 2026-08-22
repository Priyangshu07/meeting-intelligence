/**
 * API client — all calls to the backend.
 * Uses /api path which Vite proxies to localhost:3001
 */

const BASE = '/api';

/**
 * Upload an audio file and run the full pipeline.
 * @param {File} file - The real browser File object
 * @returns {Promise<Object>}
 */
export async function uploadMeeting(file) {
  const formData = new FormData();
  formData.append('audio', file);

  const res = await fetch(`${BASE}/meetings/upload`, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — browser sets it with boundary automatically
  });

  const data = await res.json();

  if (!res.ok) {
    // Surface the backend error properly
    const err = new Error(data.details || data.error || `Server error: ${res.status}`);
    err.stage = data.stage || null;
    err.transcript = data.transcript || null;
    err.meetingId = data.meetingId || null;
    throw err;
  }

  return data;
}

/**
 * Fetch all meetings for history view.
 * @returns {Promise<Array>}
 */
export async function fetchMeetings() {
  const res = await fetch(`${BASE}/meetings`);
  if (!res.ok) {
    throw new Error('Failed to load meeting history.');
  }
  return res.json();
}

/**
 * Fetch a single meeting by ID.
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function fetchMeeting(id) {
  const res = await fetch(`${BASE}/meetings/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Meeting not found.');
    throw new Error('Failed to load meeting.');
  }
  return res.json();
}

/**
 * Delete a meeting by ID.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteMeeting(id) {
  const res = await fetch(`${BASE}/meetings/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error('Failed to delete meeting.');
  }
}

/**
 * Check backend health (API keys configured etc.).
 * @returns {Promise<Object>}
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.json();
  } catch {
    return null;
  }
}
