import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/admin';
import { initDb } from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: '.env.api' });
dotenv.config();

const requiredJwtSecret = process.env.JWT_SECRET || '';
if (!requiredJwtSecret || requiredJwtSecret.length < 32 || requiredJwtSecret === 'please-change-this-secret') {
  throw new Error('[API] JWT_SECRET is missing or too weak. Use a random secret with at least 32 characters.');
}

const app = express();
const port = 3001;

const defaultOrigins = ['http://localhost:3002', 'http://127.0.0.1:3002'];
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const origins = configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins;

app.use(
  cors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
  })
);

app.use(express.json());

app.use('/api/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'jiyun-admin-api', timestamp: new Date().toISOString() });
});

app.use('/api/admin', adminRoutes);

// Global error handler — catch unhandled errors in routes so the server doesn't crash
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

process.on('uncaughtException', (err) => {
  console.error('[API] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[API] unhandledRejection:', reason);
});

const start = async (): Promise<void> => {
  await initDb();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[API] running on http://localhost:${port}`);
  });
};

start().catch((error) => {
  console.error('[API] failed to start:', error);
  process.exit(1);
});