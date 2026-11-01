/**
 * Minimal structured logger. Writes JSON lines to stderr.
 * stdout is reserved for MCP protocol messages.
 */

type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<Level, number> = {
  error: 0, warn: 1, info: 2, debug: 3,
};

let currentLevel: Level = 'info';

export function setLogLevel(level: Level): void {
  currentLevel = level;
}

function log(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] > LEVELS[currentLevel]) return;
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
  process.stderr.write(entry + '\n');
}

export const logger = {
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
};
