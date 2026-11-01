import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  validateCitationPath,
  PathTraversalError,
  DeniedFileError,
  hashFile,
  extractExcerpt,
} from './sourceInspector.js';

let tmpDir: string;
let repoRoot: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainrot-test-'));
  repoRoot = fs.realpathSync(path.resolve(tmpDir)); // resolve macOS /private/var symlink
  // Create a safe file
  fs.writeFileSync(path.join(repoRoot, 'utils.ts'), 'export const foo = 1;\nexport const bar = 2;\n');
  // Create a nested dir
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'src', 'index.ts'), 'import { foo } from "../utils.js";\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('validateCitationPath', () => {
  it('accepts a valid relative path', () => {
    const result = validateCitationPath(repoRoot, 'utils.ts');
    expect(result).toBe(path.join(repoRoot, 'utils.ts'));
  });

  it('accepts a valid nested relative path', () => {
    const result = validateCitationPath(repoRoot, 'src/index.ts');
    expect(result).toBe(path.join(repoRoot, 'src', 'index.ts'));
  });

  it('rejects path traversal with ../', () => {
    expect(() => validateCitationPath(repoRoot, '../outside.ts')).toThrow(PathTraversalError);
  });

  it('rejects path traversal with nested ../', () => {
    expect(() => validateCitationPath(repoRoot, 'src/../../outside.ts')).toThrow(PathTraversalError);
  });

  it('rejects path with null byte', () => {
    expect(() => validateCitationPath(repoRoot, 'utils\0.ts')).toThrow(PathTraversalError);
  });

  it('rejects .env file', () => {
    fs.writeFileSync(path.join(repoRoot, '.env'), 'SECRET=abc123\n');
    expect(() => validateCitationPath(repoRoot, '.env')).toThrow(DeniedFileError);
  });

  it('rejects .env.local file', () => {
    fs.writeFileSync(path.join(repoRoot, '.env.local'), 'SECRET=abc123\n');
    expect(() => validateCitationPath(repoRoot, '.env.local')).toThrow(DeniedFileError);
  });

  it('rejects private key file', () => {
    fs.writeFileSync(path.join(repoRoot, 'deploy.pem'), '-----BEGIN PRIVATE KEY-----\n');
    expect(() => validateCitationPath(repoRoot, 'deploy.pem')).toThrow(DeniedFileError);
  });

  it('rejects file with "secret" in the name', () => {
    fs.writeFileSync(path.join(repoRoot, 'my-secret-config.ts'), 'export const x = 1;');
    expect(() => validateCitationPath(repoRoot, 'my-secret-config.ts')).toThrow(DeniedFileError);
  });

  it('rejects symlink that escapes the root', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainrot-outside-'));
    try {
      const symlinkPath = path.join(repoRoot, 'evil-link.ts');
      fs.symlinkSync(path.join(outsideDir, 'outside.ts'), symlinkPath);
      fs.writeFileSync(path.join(outsideDir, 'outside.ts'), 'const evil = true;');
      expect(() => validateCitationPath(repoRoot, 'evil-link.ts')).toThrow(PathTraversalError);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe('hashFile', () => {
  it('returns a 64-char hex string for a known file', () => {
    const hash = hashFile(path.join(repoRoot, 'utils.ts'));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns 64 zeros for a missing file', () => {
    const hash = hashFile(path.join(repoRoot, 'nonexistent.ts'));
    expect(hash).toBe('0'.repeat(64));
  });

  it('returns different hashes for different content', () => {
    fs.writeFileSync(path.join(repoRoot, 'a.ts'), 'const a = 1;');
    fs.writeFileSync(path.join(repoRoot, 'b.ts'), 'const b = 2;');
    const hashA = hashFile(path.join(repoRoot, 'a.ts'));
    const hashB = hashFile(path.join(repoRoot, 'b.ts'));
    expect(hashA).not.toBe(hashB);
  });
});

describe('extractExcerpt', () => {
  it('extracts the requested lines', () => {
    const excerpt = extractExcerpt(path.join(repoRoot, 'utils.ts'), 1, 1);
    expect(excerpt).toBe('export const foo = 1;');
  });

  it('truncates at maxChars', () => {
    const excerpt = extractExcerpt(path.join(repoRoot, 'utils.ts'), 1, 2, 10);
    expect(excerpt.length).toBeLessThanOrEqual(11); // 10 chars + ellipsis
  });

  it('returns empty string for missing file', () => {
    const excerpt = extractExcerpt(path.join(repoRoot, 'ghost.ts'), 1, 5);
    expect(excerpt).toBe('');
  });
});
