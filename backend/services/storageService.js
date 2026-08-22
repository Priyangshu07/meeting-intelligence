import db from '../db/database.js';

/**
 * Create a new meeting record.
 */
export function createMeeting({ filename, file_size, file_type }) {
  const stmt = db.prepare(`
    INSERT INTO meetings (filename, file_size, file_type, status)
    VALUES (?, ?, ?, 'processing')
  `);
  const result = stmt.run(filename, file_size, file_type);
  return result.lastInsertRowid;
}

/**
 * Update a meeting with successful analysis results.
 */
export function updateMeetingSuccess(id, { transcript, summary, key_points, decisions, action_items }) {
  const stmt = db.prepare(`
    UPDATE meetings SET
      transcript = ?,
      summary = ?,
      key_points = ?,
      decisions = ?,
      action_items = ?,
      status = 'completed',
      error_message = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(
    transcript,
    summary,
    JSON.stringify(key_points),
    JSON.stringify(decisions),
    JSON.stringify(action_items),
    id
  );
}

/**
 * Update a meeting with an error state.
 */
export function updateMeetingError(id, { error_message, transcript = null, status = 'failed' }) {
  const stmt = db.prepare(`
    UPDATE meetings SET
      status = ?,
      error_message = ?,
      transcript = COALESCE(?, transcript),
      updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(status, error_message, transcript, id);
}

/**
 * Get all meetings ordered by most recent first.
 */
export function getAllMeetings() {
  const rows = db.prepare(`
    SELECT id, filename, file_size, file_type, summary, status, error_message, created_at
    FROM meetings
    ORDER BY created_at DESC
  `).all();
  return rows;
}

/**
 * Get a single meeting by ID with all data.
 */
export function getMeetingById(id) {
  const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id);
  if (!row) return null;

  return {
    ...row,
    key_points: row.key_points ? JSON.parse(row.key_points) : [],
    decisions: row.decisions ? JSON.parse(row.decisions) : [],
    action_items: row.action_items ? JSON.parse(row.action_items) : [],
  };
}

/**
 * Delete a meeting by ID.
 */
export function deleteMeeting(id) {
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
}
