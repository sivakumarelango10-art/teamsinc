import express from 'express';
import kalvilearnRoutes from './routes/kalvilearnRoutes.js';
import ticketsRoutes from './routes/ticketsRoutes.js';
import docsRoutes from './routes/docsRoutes.js';

export const app = express();

// 1. Core Security & Parsing Middleware
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. Controlled CORS policy for server-to-server & internal browser endpoints
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow localhost or same-origin for TeamSync workspace & KalviLearn
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('teamsync') || origin.includes('kalvilearn'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, Idempotency-Key, X-TeamSync-Signature, X-TeamSync-Timestamp, X-Source, X-Source-Reference');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// 3. Health Check Endpoints (GET /health & GET /api/health)
const handleHealth = async (req, res) => {
  let dbStatus = 'ok';
  let dbError = null;
  try {
    const { query } = await import('./db.js');
    await query('SELECT 1 as alive');
  } catch (err) {
    dbStatus = 'error';
    dbError = err.message;
  }

  res.status(200).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    service: 'TeamSync API Engine',
    database: { status: dbStatus, error: dbError },
    version: '1.0.2',
    timestamp: new Date().toISOString()
  });
};
app.get('/health', handleHealth);
app.get('/api/health', handleHealth);

// 4. Mount API Routes
app.use('/api/v1/tickets', ticketsRoutes);
app.use('/api/v1/integrations/kalvilearn', kalvilearnRoutes);
app.use('/api', docsRoutes);

// 5. 404 Handler for API
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route "${req.method} ${req.originalUrl}" not found.`
  });
});

// 6. Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  // Safe logging: never log sensitive headers or passwords
  console.error(`[API Error] ${req.method} ${req.path} - ${statusCode}:`, err.message);

  res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected server error occurred.'
  });
});

export default app;
