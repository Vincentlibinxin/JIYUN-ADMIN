import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import adminRoutes from './routes/admin';
import { initDb } from './db';

dotenv.config({ path: '.env.api' });
dotenv.config();

const requiredJwtSecret = process.env.JWT_SECRET || '';
if (!requiredJwtSecret || requiredJwtSecret.length < 32 || requiredJwtSecret === 'please-change-this-secret') {
  throw new Error('[API] JWT_SECRET is missing or too weak. Use a random secret with at least 32 characters.');
}

const app = express();
const port = Number(process.env.API_PORT || 3001);

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'jiyun-admin-api', timestamp: new Date().toISOString() });
});

app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
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