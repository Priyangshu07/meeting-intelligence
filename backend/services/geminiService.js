import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * The carefully engineered meeting analysis prompt.
 * Instructs Gemini to work strictly from transcript evidence,
 * distinguish discussion from confirmed decisions,
 * extract actionable tasks, and avoid hallucination.
 */
function buildAnalysisPrompt(transcript) {
  return `You are an expert meeting analyst. Your task is to analyze the following meeting transcript and extract structured information.

CRITICAL RULES:
1. Work ONLY from the transcript evidence provided. Do not invent, assume, or extrapolate.
2. Clearly distinguish between topics that were merely discussed vs. decisions that were explicitly confirmed or agreed upon.
3. Extract action items ONLY for tasks that were explicitly assigned or committed to.
4. If an owner, deadline, or priority is not explicitly mentioned in the transcript, use "Not specified".
5. Never invent names, dates, tasks, or commitments not present in the transcript.
6. Keep information concise and avoid unnecessary repetition.
7. Return ONLY valid JSON — no markdown, no code blocks, no preamble.

OUTPUT FORMAT (strict JSON, no other text):
{
  "summary": "2-4 sentence executive summary of the meeting",
  "key_points": [
    "Key discussion point 1",
    "Key discussion point 2"
  ],
  "decisions": [
    "Explicitly confirmed decision 1",
    "Explicitly confirmed decision 2"
  ],
  "action_items": [
    {
      "task": "Specific task description",
      "owner": "Person's name or 'Not specified'",
      "deadline": "Date/timeframe or 'Not specified'",
      "priority": "High / Medium / Low / Not specified"
    }
  ]
}

RULES FOR EACH FIELD:
- summary: High-level overview covering purpose, main topics, and outcome
- key_points: Major topics discussed (include both resolved and unresolved topics)
- decisions: ONLY items that were explicitly agreed upon, confirmed, or finalized — not mere discussions or suggestions
- action_items: ONLY explicit tasks with a clear next step; if nothing was assigned, return an empty array
- priority: Infer from urgency words ("urgent", "ASAP", "critical", "low priority") if present; otherwise "Not specified"

MEETING TRANSCRIPT:
---
${transcript}
---

Analyze the above transcript and return ONLY the JSON object. No other text.`;
}

/**
 * Analyze a transcript using Google Gemini.
 * @param {string} transcript - The real transcript from Groq
 * @returns {Promise<Object>} Structured meeting analysis
 */
export async function analyzeMeeting(transcript) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Please set it in your .env file.');
  }

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Cannot analyze an empty transcript.');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1, // Low temperature for factual, consistent output
      maxOutputTokens: 2048,
    },
  });

  let result;
  try {
    const prompt = buildAnalysisPrompt(transcript);
    result = await model.generateContent(prompt);
  } catch (err) {
    if (err.message?.includes('API_KEY') || err.status === 400) {
      throw new Error('Invalid Gemini API key. Please check your GEMINI_API_KEY.');
    }
    if (err.status === 429) {
      throw new Error('Gemini API rate limit exceeded. Please wait a moment and try again.');
    }
    if (err.status === 503) {
      throw new Error('Gemini service is temporarily unavailable. Please try again shortly.');
    }
    throw new Error(`Gemini analysis failed: ${err.message || 'Unknown error'}`);
  }

  const rawText = result.response.text();

  // Parse and validate the JSON response
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Attempt to extract JSON from the response if it contains extra text
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error('Gemini returned malformed JSON. The analysis could not be parsed.');
      }
    } else {
      throw new Error('Gemini returned an unexpected response format. The analysis could not be parsed.');
    }
  }

  // Validate required fields
  return validateAnalysisResponse(parsed);
}

/**
 * Validate and normalize the Gemini response to ensure all required fields exist.
 */
function validateAnalysisResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Gemini response is not a valid object.');
  }

  return {
    summary: typeof data.summary === 'string' && data.summary.trim()
      ? data.summary.trim()
      : 'Summary could not be generated from the transcript.',

    key_points: Array.isArray(data.key_points)
      ? data.key_points.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
      : [],

    decisions: Array.isArray(data.decisions)
      ? data.decisions.filter(d => typeof d === 'string' && d.trim()).map(d => d.trim())
      : [],

    action_items: Array.isArray(data.action_items)
      ? data.action_items
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            task: typeof item.task === 'string' ? item.task.trim() : 'Unknown task',
            owner: typeof item.owner === 'string' ? item.owner.trim() : 'Not specified',
            deadline: typeof item.deadline === 'string' ? item.deadline.trim() : 'Not specified',
            priority: typeof item.priority === 'string' ? item.priority.trim() : 'Not specified',
          }))
      : [],
  };
}
