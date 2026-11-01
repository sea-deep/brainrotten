/**
 * Companion HTTP server entry point.
 * Binds to loopback only. Never binds to 0.0.0.0.
 */
import express from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BrainrotStorage } from '@brainrot/core';
import { loadConfig } from './config.js';
import { SessionAuth } from './auth.js';
import { createRouter } from './http/routes.js';
import { MockJobProcessor } from './processor.js';
import { logger, setLogLevel } from './logger.js';
import { VideoStudio } from './video/runtime.js';
import { createStudioRouter } from './video/routes.js';
import { workspaceRoot, loadStudioEnv } from './video/env.js';

export async function startServer(): Promise<{ port: number; token: string }> {
  loadStudioEnv();
  const config = loadConfig();
  setLogLevel(config.logLevel);

  // Ensure data directory exists
  fs.mkdirSync(config.dataDir, { recursive: true });

  const dbPath = path.join(config.dataDir, 'db.sqlite');
  const storage = new BrainrotStorage(dbPath);

  // Recover any jobs interrupted by a previous crash
  const recovered = storage.recoverInterruptedJobs();
  if (recovered > 0) {
    logger.warn('Recovered interrupted jobs on startup', { count: recovered });
  }

  const auth = new SessionAuth(config.dataDir);
  const processor = new MockJobProcessor(storage, config.dataDir);
  const studio = new VideoStudio(config.dataDir);

  const app = express();

  // Restrict to loopback — never serve on 0.0.0.0
  // Disable x-powered-by header
  app.disable('x-powered-by');

  // CORS: no wildcard. Only allow from the dev Vite origin on loopback.
  app.use((_req, res, next) => {
    const origin = _req.headers['origin'];
    if (origin) {
      try {
        const url = new URL(origin);
        if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && [String(config.port), '5173', '4173'].includes(url.port)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }
      } catch { /* invalid origin — ignore */ }
    }
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use('/api/v1', createStudioRouter(studio, auth));
  app.use('/api/v1', createRouter(storage, config, auth));
  app.use('/api/v1',(_req,res)=>{res.status(404).json({code:'NOT_FOUND',message:'API route not found.',retryable:false});});
  const webDist = path.join(workspaceRoot, 'apps/web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist));
    app.get('/{*splat}', (_req, res) => { res.sendFile(path.join(webDist, 'index.html')); });
  }

  return new Promise((resolve) => {
    const server = app.listen(config.port, '127.0.0.1', () => {
      processor.start();
      logger.info('Companion started', {
        url: `http://localhost:${config.port}`,
        dataDir: config.dataDir,
        tokenPath: auth.getTokenPath(),
      });
      resolve({ port: config.port, token: auth.getToken() });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      processor.stop();
      server.close(() => {
        storage.close();
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      processor.stop();
      server.close(() => {
        storage.close();
        process.exit(0);
      });
    });
  });
}

// Direct entry point
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  startServer()
    .then(({ port }) => {
      logger.info(`Server running on http://127.0.0.1:${port}`);
    })
    .catch((err) => {
      logger.error('Failed to start server', { error: String(err) });
      process.exit(1);
    });
}
