/**
 * Source inspector — Git-based snapshot, path safety, hash, and bounded excerpts.
 *
 * Safety rules (see design.md §9):
 * 1. Registered repo path is resolved to canonical absolute path at registration.
 * 2. All citation paths are resolved relative to the root and checked for escape.
 * 3. Symlinks are resolved and re-checked.
 * 4. Files matching the deny list are excluded from excerpts.
 * 5. Excerpts are truncated at MAX_EXCERPT_CHARS.
 * 6. Repository code is never executed.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type {
  EvidenceSnapshotV1,
  Citation,
  ComparisonMode,
} from '@brainrot/contracts';
import { MAX_CITATIONS, MAX_EXCERPT_CHARS } from '@brainrot/contracts';

const DENY_PATTERNS = [
  /\.env($|\.)/i,
  /\.(key|pem|pfx|p12|crt|cer)$/i,
  /(secret|credential|password|passwd|private)/i,
  /\.git\/config$/,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
];

export class PathTraversalError extends Error {
  constructor(p: string) {
    super(`PATH_TRAVERSAL: "${p}" escapes the repository root`);
    this.name = 'PathTraversalError';
  }
}

export class DeniedFileError extends Error {
  constructor(p: string) {
    super(`DENIED_FILE: "${p}" matches a deny-list pattern`);
    this.name = 'DeniedFileError';
  }
}

/**
 * Resolve and validate a canonical repository root path.
 * Throws if the path does not exist or is not a directory.
 */
export function resolveRepoRoot(rawPath: string): string {
  const resolved = fs.realpathSync(path.resolve(rawPath));
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${rawPath}`);
  }
  return resolved;
}

/**
 * Validate a repository-relative citation path.
 * Returns the absolute path if safe; throws PathTraversalError or DeniedFileError otherwise.
 */
export function validateCitationPath(repoRoot: string, citationPath: string): string {
  // Prevent null bytes and OS-specific tricks
  if (citationPath.includes('\0')) throw new PathTraversalError(citationPath);

  // Resolve relative to the repo root
  const joined = path.join(repoRoot, citationPath);

  // Check for escape before resolving symlinks
  const rel = path.relative(repoRoot, joined);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathTraversalError(citationPath);
  }

  // Resolve symlinks and re-check
  let real: string;
  try {
    real = fs.realpathSync(joined);
  } catch {
    // File may not exist (deleted file); return the joined path for status tracking
    return joined;
  }

  // Use realpathSync on both sides to ensure consistent comparison on macOS
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(repoRoot);
  } catch {
    realRoot = repoRoot;
  }

  const relAfterSymlink = path.relative(realRoot, real);
  if (relAfterSymlink.startsWith('..') || path.isAbsolute(relAfterSymlink)) {
    throw new PathTraversalError(citationPath);
  }

  // Check deny list
  const normalized = citationPath.replace(/\\/g, '/').toLowerCase();
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new DeniedFileError(citationPath);
    }
  }

  return real;
}

/** SHA-256 hex hash of file content. */
export function hashFile(absPath: string): string {
  try {
    const content = fs.readFileSync(absPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '0'.repeat(64);
  }
}

/** Extract a bounded excerpt from a file (lines startLine..endLine, 1-indexed). */
export function extractExcerpt(
  absPath: string,
  startLine: number,
  endLine: number,
  maxChars = MAX_EXCERPT_CHARS
): string {
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');
    const slice = lines
      .slice(Math.max(0, startLine - 1), endLine)
      .join('\n');
    return slice.length > maxChars ? slice.slice(0, maxChars) + '…' : slice;
  } catch {
    return '';
  }
}

interface ChangedFile {
  path: string; // repo-relative
  changeType: 'modified' | 'added' | 'deleted' | 'untracked';
}

/** Run git commands against the repo root. Never execute repository code. */
function gitCommand(repoRoot: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function getGitBaseRevision(repoRoot: string): string | null {
  const sha = gitCommand(repoRoot, ['rev-parse', 'HEAD']);
  return sha || null;
}

function getChangedFiles(repoRoot: string, mode: ComparisonMode): ChangedFile[] {
  const files: ChangedFile[] = [];

  if (mode === 'git-head' || mode === 'dirty-working-tree') {
    // Staged and unstaged changes against HEAD
    const status = gitCommand(repoRoot, ['status', '--porcelain=v1']);
    for (const line of status.split('\n')) {
      if (!line.trim()) continue;
      const xy = line.slice(0, 2);
      const filePath = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
      if (!filePath) continue;

      if (xy.includes('?')) {
        files.push({ path: filePath, changeType: 'untracked' });
      } else if (xy.includes('D')) {
        files.push({ path: filePath, changeType: 'deleted' });
      } else if (xy.includes('A')) {
        files.push({ path: filePath, changeType: 'added' });
      } else {
        files.push({ path: filePath, changeType: 'modified' });
      }
    }
  }

  return files;
}

/**
 * Capture an evidence snapshot for a project.
 * Only surfaces safe, bounded citation data. Never executes repository code.
 */
export function captureSnapshot(
  projectId: string,
  repoRoot: string,
  mode: ComparisonMode = 'git-head'
): EvidenceSnapshotV1 {
  const snapshotId = randomUUID();
  const createdAt = new Date().toISOString();
  const baseRevision = getGitBaseRevision(repoRoot);

  const changedFiles = getChangedFiles(repoRoot, mode);

  // Limit to MAX_CITATIONS; filter out denied files
  const allowedFiles = changedFiles
    .filter((f) => {
      if (f.changeType === 'deleted') return true; // include but mark deleted
      try {
        validateCitationPath(repoRoot, f.path);
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, MAX_CITATIONS);

  const citations: Citation[] = allowedFiles.map((f) => {
    const citationId = randomUUID();
    const isDeleted = f.changeType === 'deleted';
    let contentHash = '0'.repeat(64);
    let excerpt = '';
    let startLine = 1;
    let endLine = 1;

    if (!isDeleted) {
      try {
        const absPath = validateCitationPath(repoRoot, f.path);
        contentHash = hashFile(absPath);
        const content = fs.readFileSync(absPath, 'utf-8');
        const lines = content.split('\n');
        endLine = Math.min(lines.length, 30); // excerpt first 30 lines
        excerpt = extractExcerpt(absPath, startLine, endLine);
      } catch {
        // Path validation or read failure — still include as unavailable
      }
    }

    return {
      citationId,
      path: f.path,
      symbol: null,
      startLine,
      endLine,
      contentHash,
      excerpt,
      verificationStatus: isDeleted ? 'deleted' : 'verified',
    };
  });

  // If no changed files found (clean working tree), add the README or first tracked file
  if (citations.length === 0) {
    const tracked = gitCommand(repoRoot, ['ls-files', '--', '*.ts', '*.js', '*.md'])
      .split('\n')
      .filter(Boolean)
      .slice(0, 3);

    for (const filePath of tracked) {
      try {
        const citationId = randomUUID();
        const absPath = validateCitationPath(repoRoot, filePath);
        const contentHash = hashFile(absPath);
        const content = fs.readFileSync(absPath, 'utf-8');
        const lines = content.split('\n');
        const endLine = Math.min(lines.length, 20);
        const excerpt = extractExcerpt(absPath, 1, endLine);
        citations.push({
          citationId,
          path: filePath,
          symbol: null,
          startLine: 1,
          endLine,
          contentHash,
          excerpt,
          verificationStatus: 'verified',
        });
      } catch {
        // skip
      }
      if (citations.length >= 3) break;
    }
  }

  return {
    schemaVersion: 'EvidenceSnapshotV1',
    snapshotId,
    projectId,
    createdAt,
    baseRevision,
    comparisonMode: mode,
    citations,
  };
}

/**
 * Check whether the files cited in a snapshot still match their recorded hashes.
 * Returns the citation IDs of stale or deleted citations.
 */
export function checkSnapshotFreshness(
  repoRoot: string,
  snapshot: EvidenceSnapshotV1
): string[] {
  const staleCitationIds: string[] = [];

  for (const citation of snapshot.citations) {
    if (citation.verificationStatus === 'deleted') continue;

    try {
      const absPath = validateCitationPath(repoRoot, citation.path);
      const currentHash = hashFile(absPath);
      if (currentHash !== citation.contentHash) {
        staleCitationIds.push(citation.citationId);
      }
    } catch {
      // File deleted or path issue → stale
      staleCitationIds.push(citation.citationId);
    }
  }

  return staleCitationIds;
}
