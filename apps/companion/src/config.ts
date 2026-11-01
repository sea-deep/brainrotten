/**
 * Companion configuration — reads from environment, applies safe defaults.
 * Never reads ELEVENLABS_KEY, AWS credentials, or other paid service keys.
 */
import * as path from 'node:path';
import * as os from 'node:os';

export interface CompanionConfig {
  port: number;
  dataDir: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export function loadConfig(): CompanionConfig {
  const port = parseInt(process.env['BRAINROT_PORT'] ?? '3001', 10);
  const dataDir =
    process.env['BRAINROT_DATA_DIR'] ??
    path.join(os.homedir(), '.local', 'share', 'brainrot');
  const logLevel = (process.env['BRAINROT_LOG_LEVEL'] as CompanionConfig['logLevel']) ?? 'info';

  return { port, dataDir, logLevel };
}
