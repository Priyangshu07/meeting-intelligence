import express from 'express';
import cors from 'cors';
import meetingsRouter from './routes/meetings.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Validate required API keys on startup
const missingKeys = [];
if (!process.env.GROQ_API_KEY) missingKeys.push('GROQ_API_KEY');
if (!process.env.GEMINI_API_KEY) missingKeys.push('GEMINI_API_KEY');

if (missingKeys.length > 0) {
  console.warn('\n⚠️  WARNING: Missing environment variables:', missingKeys.join(', '));
  console.warn('   API calls will fail until these are set in your .env file.\n');
}

// CORS — allow frontend dev server and production
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      groq: !!process.env.GROQ_API_KEY ? 'configured' : 'missing key',
      gemini: !!process.env.GEMINI_API_KEY ? 'configured' : 'missing key',
    },
  });
});

// Meeting routes
app.use('/api/meetings', meetingsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Meeting Intelligence backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   API: http://localhost:${PORT}/api/meetings\n`);
});

export default app;
