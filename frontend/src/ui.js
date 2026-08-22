/**
 * UI helpers — DOM manipulation, rendering, formatting.
 */

/* ── Utilities ── */

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatFileType(mimetype) {
  const map = {
    'audio/mpeg': 'MP3', 'audio/mp3': 'MP3',
    'audio/wav': 'WAV', 'audio/x-wav': 'WAV',
    'audio/m4a': 'M4A', 'audio/x-m4a': 'M4A', 'audio/mp4': 'M4A',
    'audio/flac': 'FLAC',
    'audio/ogg': 'OGG',
    'audio/webm': 'WebM', 'video/webm': 'WebM',
    'video/mp4': 'MP4',
  };
  return map[mimetype] || mimetype.split('/')[1]?.toUpperCase() || 'Audio';
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function truncate(str, max = 100) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/* ── View management ── */

const VIEWS = ['upload-view', 'processing-view', 'error-view', 'results-view', 'history-view'];

export function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.hidden = v !== id;
  });
}

/* ── Processing steps ── */

const STEPS = ['step-upload', 'step-transcribe', 'step-analyze', 'step-complete'];

export function setProcessingStep(stepId) {
  const idx = STEPS.indexOf(stepId);
  STEPS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });
}

export function setProcessingMessage(title, sub) {
  const t = document.getElementById('processing-title');
  const s = document.getElementById('processing-sub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
}

/* ── Results rendering ── */

export function renderResults(data) {
  // Header
  document.getElementById('results-filename').textContent = data.filename;
  document.getElementById('results-meta').textContent =
    `${formatFileSize(data.file_size || 0)} · ${new Date(data.created_at).toLocaleString()}`;

  // Summary
  document.getElementById('summary-text').textContent =
    data.summary || 'No summary available.';

  // Key points
  const keyPoints = data.key_points || [];
  document.getElementById('points-badge').textContent = keyPoints.length;
  const pointsList = document.getElementById('key-points-list');
  const pointsEmpty = document.getElementById('key-points-empty');
  pointsList.innerHTML = '';
  if (keyPoints.length === 0) {
    pointsEmpty.hidden = false;
  } else {
    pointsEmpty.hidden = true;
    keyPoints.forEach(pt => {
      const li = document.createElement('li');
      li.textContent = pt;
      pointsList.appendChild(li);
    });
  }

  // Decisions
  const decisions = data.decisions || [];
  document.getElementById('decisions-badge').textContent = decisions.length;
  const decisionsList = document.getElementById('decisions-list');
  const decisionsEmpty = document.getElementById('decisions-empty');
  decisionsList.innerHTML = '';
  if (decisions.length === 0) {
    decisionsEmpty.hidden = false;
  } else {
    decisionsEmpty.hidden = true;
    decisions.forEach(d => {
      const li = document.createElement('li');
      li.textContent = d;
      decisionsList.appendChild(li);
    });
  }

  // Action items
  const actionItems = data.action_items || [];
  document.getElementById('actions-badge').textContent = actionItems.length;
  const tbody = document.getElementById('action-items-body');
  const actionsEmpty = document.getElementById('actions-empty');
  const actionContainer = document.getElementById('action-items-container');
  tbody.innerHTML = '';

  if (actionItems.length === 0) {
    actionsEmpty.hidden = false;
    actionContainer.hidden = true;
  } else {
    actionsEmpty.hidden = true;
    actionContainer.hidden = false;
    actionItems.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="action-task">${escapeHtml(item.task)}</td>
        <td>${escapeHtml(item.owner)}</td>
        <td>${escapeHtml(item.deadline)}</td>
        <td>${renderPriorityBadge(item.priority)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Transcript
  document.getElementById('transcript-text').textContent =
    data.transcript || 'No transcript available.';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPriorityBadge(priority) {
  const p = (priority || '').toLowerCase();
  let cls = 'priority-default';
  if (p === 'high') cls = 'priority-high';
  else if (p === 'medium') cls = 'priority-medium';
  else if (p === 'low') cls = 'priority-low';
  return `<span class="priority-badge ${cls}">${escapeHtml(priority || 'Not specified')}</span>`;
}

/* ── History rendering ── */

export function renderHistory(meetings, onSelect, onDelete) {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const loading = document.getElementById('history-loading');

  loading.hidden = true;

  if (!meetings || meetings.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = '';

  meetings.forEach(m => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.id = m.id;

    const statusCls = m.status === 'completed' ? 'status-completed'
      : m.status === 'failed' || m.status === 'transcription_failed' || m.status === 'analysis_failed' ? 'status-failed'
      : 'status-processing';

    const statusLabel = m.status === 'completed' ? 'Completed'
      : m.status === 'transcription_failed' ? 'Transcription Failed'
      : m.status === 'analysis_failed' ? 'Analysis Failed'
      : m.status === 'failed' ? 'Failed'
      : 'Processing';

    item.innerHTML = `
      <div class="history-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div class="history-content">
        <div class="history-filename">${escapeHtml(m.filename)}</div>
        <div class="history-summary">${truncate(m.summary || m.error_message || 'No summary', 90)}</div>
      </div>
      <span class="history-date">${formatDate(m.created_at)}</span>
      <span class="history-status ${statusCls}">${statusLabel}</span>
      <button class="history-delete-btn" data-id="${m.id}" aria-label="Delete meeting" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    `;

    // Click on item → open meeting
    item.addEventListener('click', e => {
      if (!e.target.closest('.history-delete-btn')) {
        onSelect(m.id);
      }
    });

    // Delete button
    item.querySelector('.history-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      onDelete(m.id, item);
    });

    list.appendChild(item);
  });
}

/* ── Toast ── */

let toastTimer = null;

export function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show${type !== 'default' ? ` toast-${type}` : ''}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ── Copy to clipboard ── */

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}

/* ── Build export text ── */

export function buildExportText(data) {
  const lines = [];
  lines.push('MEETING INTELLIGENCE REPORT');
  lines.push('═'.repeat(50));
  lines.push(`File: ${data.filename}`);
  lines.push(`Generated: ${new Date(data.created_at).toLocaleString()}`);
  lines.push('');

  lines.push('MEETING SUMMARY');
  lines.push('─'.repeat(50));
  lines.push(data.summary || 'N/A');
  lines.push('');

  if (data.key_points?.length) {
    lines.push('KEY DISCUSSION POINTS');
    lines.push('─'.repeat(50));
    data.key_points.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    lines.push('');
  }

  if (data.decisions?.length) {
    lines.push('CONFIRMED DECISIONS');
    lines.push('─'.repeat(50));
    data.decisions.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
    lines.push('');
  }

  if (data.action_items?.length) {
    lines.push('ACTION ITEMS');
    lines.push('─'.repeat(50));
    data.action_items.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.task}`);
      lines.push(`   Owner: ${item.owner}`);
      lines.push(`   Deadline: ${item.deadline}`);
      lines.push(`   Priority: ${item.priority}`);
    });
    lines.push('');
  }

  if (data.transcript) {
    lines.push('FULL TRANSCRIPT');
    lines.push('─'.repeat(50));
    lines.push(data.transcript);
  }

  return lines.join('\n');
}
