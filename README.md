# Meeting Intelligence

**AI-powered meeting transcription and analysis for Unthinkable Solutions internship screening assignment.**

[![Assignment](https://img.shields.io/badge/Assignment-Meeting%20Summarizer-6366f1)](https://github.com/Priyangshu07/meeting-intelligence)
[![ASR](https://img.shields.io/badge/ASR-Groq%20Whisper%20Large%20V3%20Turbo-orange)](https://console.groq.com)
[![LLM](https://img.shields.io/badge/LLM-Google%20Gemini%201.5%20Flash-blue)](https://aistudio.google.com)

---

## Overview

Meeting Intelligence is a full-stack AI application that transforms raw meeting audio into structured, actionable intelligence. Upload any meeting recording, and the application produces a text transcript, executive summary, key discussion points, confirmed decisions, and action items — all powered by real AI APIs.

---

## Problem

Modern teams record hundreds of hours of meetings, but extracting value from recordings is time-consuming. Participants often miss action items, leave decisions undocumented, and lose context from earlier discussions.

---

## Solution

A two-stage AI pipeline:
1. **Groq Whisper** (whisper-large-v3-turbo) — ultra-fast, accurate speech-to-text transcription
2. **Google Gemini** (gemini-2.5-flash) — structured meeting analysis with carefully engineered prompts

The result is a clean, shareable meeting intelligence report in seconds.

---

## Features

- 🎙️ **Real audio transcription** via Groq Whisper large-v3-turbo
- 🤖 **AI-powered analysis** via Google Gemini 1.5 Flash
- 📋 **Structured output**: summary · key points · confirmed decisions · action items
- 📊 **Action item table**: task · owner · deadline · priority
- 📝 **Full transcript viewer** (collapsible)
- 📥 **Copy & download** meeting intelligence report
- 🕐 **Meeting history** — all past meetings stored locally (SQLite)
- 🎨 **Premium dark UI** with glassmorphism and animations
- ⚡ **Real error handling** at every stage — no fake fallbacks

---

## Architecture

```
BROWSER
  │
  │ FormData (real audio bytes)
  ▼
EXPRESS BACKEND
  │
  ├─► multer (memory storage — passes real bytes, never saves to disk)
  │
  ├─► Validation (type, size, format)
  │
  ├─► Groq ASR API (whisper-large-v3-turbo)
  │     └─► Real transcript text
  │
  ├─► Gemini LLM API (gemini-2.5-flash)
  │     └─► Structured JSON: summary, key_points, decisions, action_items
  │
  └─► SQLite (better-sqlite3)
        └─► Persisted meeting record
```

---

## AI Pipeline

```
AUDIO FILE
    ↓
GROQ whisper-large-v3-turbo
    ↓
REAL TRANSCRIPT
    ↓
GEMINI 1.5 FLASH
(engineered prompt with anti-hallucination rules)
    ↓
┌──────────┬──────────┬──────────────┐
│ Summary  │Decisions │ Action Items │
└──────────┴──────────┴──────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + Vanilla JS + CSS |
| Backend | Node.js + Express |
| ASR | Groq `whisper-large-v3-turbo` |
| LLM | Google Gemini `gemini-2.5-flash` |
| Storage | SQLite via `better-sqlite3` |
| File upload | `multer` (memory storage) |

---

## Setup

### Prerequisites

- Node.js 18+ (for `--env-file` support)
- Groq API key — [console.groq.com](https://console.groq.com)
- Gemini API key — [aistudio.google.com](https://aistudio.google.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/Priyangshu07/meeting-intelligence.git
cd meeting-intelligence

# Install all dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm install  # root (concurrently)
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```env
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
PORT=3001
```

> ⚠️ Never commit the `.env` file. It is in `.gitignore`.

---

## Running Locally

```bash
# Terminal 1 — Backend
cd backend
node --env-file=../.env server.js

# Terminal 2 — Frontend
cd frontend
npx vite --port 5173
```

Or use the root script (requires Node 18+ and concurrently):

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Usage

1. Click **"Drop your audio file here"** or drag and drop an audio file
2. Click **"Transcribe & Analyze"**
3. Wait for the 3-step pipeline (Upload → Transcribe → Analyze)
4. Review your structured meeting intelligence:
   - Meeting Summary
   - Key Discussion Points
   - Confirmed Decisions
   - Action Items (with owner, deadline, priority)
   - Full Transcript (collapsible)
5. **Copy All** or **Download** the report as a text file
6. View past meetings in the **History** tab

---

## Assignment Requirements Covered

| Requirement | Implementation |
|------------|---------------|
| Transcribe meeting audio | Groq Whisper large-v3-turbo |
| Text transcript | Full verbatim transcript displayed |
| Meeting summary | Gemini structured summary |
| Action items | Structured table with task/owner/deadline/priority |
| ASR API integration | `groq-sdk` with real file bytes |
| Backend to store/process | Express + SQLite |
| LLM for summary | Gemini 1.5 Flash with engineered prompt |
| Key decisions | Separate "Confirmed Decisions" section |
| GitHub repository | This repository |
| README | This document |

---

## Limitations

- Maximum audio file size: 25 MB (Groq API limit)
- Supported formats: MP3, WAV, M4A, FLAC, OGG, WEBM, MP4
- No real-time streaming transcription (batch processing only)
- Meeting history is local to the deployment machine (SQLite file)
- Language: primarily English (whisper-large-v3-turbo supports multilingual)
- Groq API free tier has rate limits

---

## Future Improvements

- Speaker diarization (who said what)
- Real-time recording in the browser (MediaRecorder API)
- Export to PDF, Notion, or Slack
- Multi-language support with auto-detection
- Searchable transcript with timestamp navigation
- Cloud storage for meeting history (PostgreSQL/S3)
- Team collaboration and sharing
