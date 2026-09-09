import { app } from './app.js';
import { pool } from './db.js';

const PORT = parseInt(process.env.PORT || process.env.API_PORT || '3001', 10);

async function startServer() {
  try {
    // Verify database connection on startup
    await pool.query('SELECT 1');
    console.log('✅ Connected to TeamSync PostgreSQL database successfully.');

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 TeamSync API Server running on port ${PORT}`);
      console.log(`📖 Interactive API Docs: http://localhost:${PORT}/api/docs`);
      console.log(`⚡ Health Check: http://localhost:${PORT}/api/health`);
    });

    const shutdown = async () => {
      console.log('\nShutting down TeamSync API server gracefully...');
      server.close(async () => {
        await pool.end();
        console.log('PostgreSQL connection pool closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('Failed to start TeamSync API server:', err);
    process.exit(1);
  }
}

startServer();
