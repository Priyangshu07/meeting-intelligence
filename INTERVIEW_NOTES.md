# INTERVIEW NOTES — Meeting Intelligence

These notes match the actual implemented code. Use them to prepare for your interview.

---

## What the Application Does

Meeting Intelligence converts raw meeting audio recordings into structured, actionable intelligence using a two-stage AI pipeline:

1. **Transcription** — Groq Whisper (whisper-large-v3-turbo) converts speech to text
2. **Analysis** — Google Gemini (gemini-2.5-flash) analyzes the transcript and extracts: summary, key discussion points, confirmed decisions, and action items

The result is a clean meeting intelligence report with an action item table (task · owner · deadline · priority) that teams can immediately act on.

---

## Architecture

```
Browser (Vite + Vanilla JS)
      │
      │  POST /api/meetings/upload  (FormData with real audio bytes)
      ▼
Express Server (Node.js)
      │
      ├─► multer (memoryStorage) — receives raw file Buffer
      ├─► Validation (size, type, extension)
      ├─► groqService.js — sends Buffer to Groq ASR
      ├─► geminiService.js — sends transcript to Gemini
      └─► storageService.js — persists to SQLite
```

**Why this structure?** Each concern is separated: upload/validation, ASR, LLM, and persistence are independent modules. This makes it easy to swap the ASR or LLM provider without touching other code.

---

## Complete Data Flow

```
1. User selects real audio file in browser
2. Browser creates FormData with the real File object
3. Frontend sends POST /api/meetings/upload
4. multer (memoryStorage) reads the file into memory as a Buffer
5. Validation checks: file present, size ≤ 25 MB, supported format
6. SQLite record created (status: 'processing')
7. Groq SDK sends the Buffer to whisper-large-v3-turbo
8. Groq returns real transcript text
9. Gemini SDK sends transcript + engineered prompt to gemini-2.5-flash
10. Gemini returns structured JSON (summary, key_points, decisions, action_items)
11. JSON validated and normalized
12. SQLite record updated (status: 'completed')
13. Response sent to browser
14. Browser renders structured results
```

---

## Audio Upload Flow

**Critical implementation detail:** The audio file is stored in memory (never on disk during processing) using multer's `memoryStorage`. This gives us a raw `Buffer` object that contains the actual audio bytes.

The Buffer is then converted to a Node.js `Readable` stream with a `.path` property set to the original filename. The Groq SDK uses the `.path` to determine the content-type and filename for its multipart upload.

```javascript
// In groqService.js
const readable = Readable.from(fileBuffer);
readable.path = filename; // Groq uses this for content-type detection

const transcription = await client.audio.transcriptions.create({
  file: readable,
  model: 'whisper-large-v3-turbo',
  response_format: 'json',
});
```

This ensures the **actual audio bytes** from the browser reach the Groq API. We never send a filename string or a fake path.

---

## Groq ASR

**Model:** `whisper-large-v3-turbo`

**Why Groq?**
- Extremely fast inference (typically 10-30x faster than OpenAI)
- Whisper large-v3-turbo offers the best price-to-performance ratio
- Supports MP3, WAV, M4A, FLAC, OGG, WEBM, MP4
- 25 MB file size limit

**Error handling:**
- 401 → Invalid API key message
- 429 → Rate limit message
- 400 → File format/corruption message
- Empty transcript → User-friendly explanation
- Network failure → Propagated as real error

---

## Gemini Analysis

**Model:** `gemini-2.5-flash`

**Why Gemini Flash?**
- Fast and cost-effective for structured extraction
- Supports controlled generation with `responseMimeType: 'application/json'`
- High context window handles long transcripts

**Configuration:**
- `temperature: 0.1` — low temperature for factual, consistent output
- `responseMimeType: 'application/json'` — forces JSON output mode

---

## Prompt Engineering

The prompt is designed to prevent hallucination and produce consistent, usable output.

**Key principles:**
1. "Work ONLY from transcript evidence" — explicit anti-hallucination instruction
2. "Distinguish discussion vs confirmed decisions" — reduces false positives in the decisions field
3. "Use 'Not specified' when information is absent" — prevents invented names/dates
4. Low temperature (0.1) — reduces creative hallucination
5. JSON schema defined in the prompt — consistent structure
6. `responseMimeType: 'application/json'` — enforced at the API level

**The prompt explicitly tells the model:**
- Do not invent names, tasks, dates, or commitments
- Only mark something as a "confirmed decision" if it was explicitly agreed upon
- Return empty arrays if no items were found
- No markdown, no code blocks — just raw JSON

---

## Structured Output

The Gemini response is:
1. Parsed with `JSON.parse()`
2. Validated field by field (type checking, array validation)
3. Normalized (missing fields get safe defaults)
4. If Gemini returns malformed JSON, we attempt regex extraction before throwing an error

```javascript
{
  "summary": "...",
  "key_points": ["..."],
  "decisions": ["..."],
  "action_items": [
    { "task": "...", "owner": "...", "deadline": "...", "priority": "..." }
  ]
}
```

---

## Hallucination Prevention

Multiple layers:
1. **Prompt instruction**: "Work ONLY from transcript evidence"
2. **Low temperature**: 0.1 reduces creative generation
3. **Response validation**: We check every field and apply safe defaults
4. **"Not specified" default**: For owner/deadline/priority when not mentioned
5. **Decision vs discussion distinction**: The prompt explicitly differentiates these
6. **No mock fallbacks**: If the API fails, we show a real error — never fake data

---

## Backend

- **Framework:** Express.js (minimal, well-understood)
- **File upload:** multer with `memoryStorage` — no temp files on disk
- **Routing:** Modular (`routes/meetings.js`)
- **Services:** Separated by responsibility (`groqService`, `geminiService`, `storageService`)
- **Error handling:** Each stage has specific error catching with meaningful messages

---

## Frontend

- **Build tool:** Vite (fast HMR, proxies /api to backend)
- **Framework:** Vanilla JavaScript (no React overhead for this scope)
- **State:** Minimal — `selectedFile` and `currentResult`
- **Architecture:** Separated into `api.js` (network), `ui.js` (DOM), `main.js` (controller)

---

## Storage

- **SQLite** via `better-sqlite3` (synchronous, embedded, no server needed)
- **WAL mode** enabled for better concurrent read performance
- **Schema:** filename, file_size, file_type, transcript, summary, key_points (JSON), decisions (JSON), action_items (JSON), status, error_message, created_at
- **Why SQLite?** Perfect for a single-machine application. Zero configuration. Persistent across restarts. Easy to inspect.

---

## Error Handling

The system has three failure modes, each handled correctly:

| Failure | What Happens |
|---------|-------------|
| Invalid file | 400 error shown before any API call |
| Groq transcription fails | Real error message shown, meeting marked `transcription_failed` |
| Gemini analysis fails | Real error shown, transcript preserved and visible |

**No mock fallbacks exist in the codebase.** If an API fails, the user sees a real error.

---

## Security

- API keys loaded via environment variables only (`process.env.GROQ_API_KEY`)
- Keys never appear in frontend code (all API calls go through the backend)
- Keys never logged, never committed
- `.gitignore` excludes `.env`
- `.env.example` has only empty values
- CORS restricted to known frontend origins

---

## Testing Performed

1. ✅ Application starts successfully
2. ✅ Backend health endpoint confirms API keys configured
3. ✅ Real audio file selected in browser
4. ✅ FormData with real file bytes sent to backend
5. ✅ multer receives actual file Buffer (confirmed via console.log size)
6. ✅ Groq receives actual audio bytes (confirmed via transcript content)
7. ✅ Real transcript displayed in UI
8. ✅ Transcript sent to Gemini (confirmed via analysis accuracy)
9. ✅ Real summary, decisions, action items rendered
10. ✅ SQLite persistence confirmed (history tab shows past meetings)
11. ✅ Invalid file type → validation error shown
12. ✅ Copy All → clipboard contents verified
13. ✅ Download → .txt file downloaded with full report

---

## Why These Technologies?

| Choice | Reason |
|--------|--------|
| Groq Whisper | Fastest ASR available; whisper-large-v3-turbo is the highest accuracy model on Groq |
| Gemini Flash | Fast, cheap, supports JSON mode, sufficient for structured extraction |
| Express | Minimal, well-documented, perfect for a focused API |
| SQLite | Zero-config persistence, embedded, no external DB server |
| Vite | Fast dev server with built-in proxy for API calls |
| Vanilla JS | Appropriate complexity for this scope; no framework overhead |
| multer memoryStorage | Avoids temp files; passes bytes directly to Groq |

---

## Biggest Challenge

The most critical implementation detail was ensuring the **real audio bytes** travel from the browser to Groq. The naive approach of sending just the filename would fail silently. The solution:

1. Use `FormData` in the browser (not JSON) to send the actual file
2. Use `multer.memoryStorage()` to receive the raw bytes as a `Buffer`
3. Convert the `Buffer` to a `Readable` stream with a `.path` property
4. The Groq SDK uses `.path` to set the content-type correctly

---

## Limitations

- 25 MB file size limit (Groq API constraint)
- No speaker diarization
- No streaming/real-time transcription
- History is local (SQLite on disk)
- Rate limits on free API tiers

---

## Future Improvements

- Speaker diarization (identify who said what)
- Real-time browser recording with MediaRecorder API
- Export to PDF, Notion, Slack
- Multi-language auto-detection
- Cloud storage for meeting history
- Team sharing and collaboration
- Timestamp-based transcript navigation

---

## Likely Interview Questions

**Q: How does the audio file get from the browser to Groq?**
A: The browser sends a `FormData` POST request. multer receives the file into memory as a `Buffer`. We convert it to a `Readable` stream and pass it directly to the Groq SDK. The Groq SDK handles multipart upload to the Whisper API.

**Q: How do you prevent the LLM from hallucinating?**
A: Three-part strategy: (1) the prompt explicitly instructs "work only from transcript evidence," (2) we use temperature 0.1 for factual consistency, (3) we default missing fields to "Not specified" rather than guessing.

**Q: What happens if Groq fails?**
A: The backend catches the error, marks the meeting as `transcription_failed` in SQLite, and returns a meaningful error message. The frontend displays the real error — never fake data.

**Q: Why SQLite over PostgreSQL?**
A: SQLite is a perfect fit for a single-machine application with no concurrent writers. Zero configuration, embedded, file-based, persistent across restarts. For production with multiple servers, we'd switch to PostgreSQL.

**Q: How do you distinguish decisions from discussion points?**
A: The prompt explicitly tells Gemini: "Only mark something as a 'confirmed decision' if it was explicitly agreed upon, confirmed, or finalized in the transcript — not mere discussions or suggestions." This prevents false positives.

**Q: Why Gemini instead of GPT-4?**
A: The assignment specified Gemini. Additionally, Gemini Flash is fast, cost-effective, and supports native JSON mode with schema enforcement.

**Q: What is your prompt engineering strategy?**
A: The prompt is structured with explicit rules, a defined JSON schema, and anti-hallucination constraints. The key insight is treating prompt engineering like a specification document — every rule exists to prevent a specific failure mode.

**Q: How would you scale this?**
A: Replace SQLite with PostgreSQL, add a job queue (BullMQ/Redis) for async processing, use S3 for audio storage, add authentication, and deploy with Docker.
