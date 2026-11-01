/**
 * SQLite persistence layer — the single authoritative database owner.
 * Uses node:sqlite (built-in, stable in Node 26).
 *
 * All synchronous DB operations are fine for the companion's use case;
 * they run in the same event loop but are only called from API handlers,
 * not in tight request-path loops.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  JobRecord,
  JobState,
  JobMode,
  LessonDraftV1,
} from '@brainrot/contracts';
import type { EvidenceSnapshotV1 } from '@brainrot/contracts';

export interface ProjectRow {
  projectId: string;
  label: string;
  repoPath: string;
  createdAt: string;
}

export class BrainrotStorage {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        projectId TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        repoPath TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        snapshotId TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        data TEXT NOT NULL,      -- JSON-serialized EvidenceSnapshotV1
        createdAt TEXT NOT NULL,
        FOREIGN KEY (projectId) REFERENCES projects(projectId)
      );

      CREATE TABLE IF NOT EXISTS jobs (
        jobId TEXT PRIMARY KEY,
        lessonId TEXT NOT NULL,
        projectId TEXT NOT NULL,
        snapshotId TEXT NOT NULL,
        submissionId TEXT NOT NULL,
        payloadHash TEXT NOT NULL,
        state TEXT NOT NULL,
        mode TEXT NOT NULL,
        attemptCount INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        errorCode TEXT,
        errorMessage TEXT,
        manifestPath TEXT
      );

      CREATE INDEX IF NOT EXISTS jobs_submissionId ON jobs(submissionId);
      CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state);

      CREATE TABLE IF NOT EXISTS lesson_drafts (
        lessonId TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  registerProject(label: string, repoPath: string): ProjectRow {
    const projectId = randomUUID();
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO projects (projectId, label, repoPath, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(projectId, label, repoPath, createdAt);
    return { projectId, label, repoPath, createdAt };
  }

  getProject(projectId: string): ProjectRow | null {
    const row = this.db.prepare(`
      SELECT projectId, label, repoPath, createdAt FROM projects WHERE projectId = ?
    `).get(projectId) as ProjectRow | undefined;
    return row ?? null;
  }

  listProjects(): ProjectRow[] {
    return this.db.prepare(`
      SELECT projectId, label, repoPath, createdAt FROM projects ORDER BY createdAt DESC
    `).all() as unknown as ProjectRow[];
  }

  findProjectByRepoPath(repoPath: string): ProjectRow | null {
    const row = this.db.prepare(`
      SELECT projectId, label, repoPath, createdAt FROM projects WHERE repoPath = ?
    `).get(repoPath) as ProjectRow | undefined;
    return row ?? null;
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  saveSnapshot(snapshot: EvidenceSnapshotV1): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO snapshots (snapshotId, projectId, data, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(snapshot.snapshotId, snapshot.projectId, JSON.stringify(snapshot), snapshot.createdAt);
  }

  getSnapshot(snapshotId: string): EvidenceSnapshotV1 | null {
    const row = this.db.prepare(`
      SELECT data FROM snapshots WHERE snapshotId = ?
    `).get(snapshotId) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as EvidenceSnapshotV1;
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────

  createJob(params: {
    lessonId: string;
    projectId: string;
    snapshotId: string;
    submissionId: string;
    payloadHash: string;
    mode: JobMode;
    draft?: LessonDraftV1;
  }): JobRecord {
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job: JobRecord = {
      jobId,
      lessonId: params.lessonId,
      projectId: params.projectId,
      snapshotId: params.snapshotId,
      submissionId: params.submissionId,
      payloadHash: params.payloadHash,
      state: 'queued',
      mode: params.mode,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
      errorCode: null,
      errorMessage: null,
      manifestPath: null,
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`
      INSERT INTO jobs (
        jobId, lessonId, projectId, snapshotId, submissionId,
        payloadHash, state, mode, attemptCount,
        createdAt, updatedAt, errorCode, errorMessage, manifestPath
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.jobId, job.lessonId, job.projectId, job.snapshotId, job.submissionId,
      job.payloadHash, job.state, job.mode, job.attemptCount,
      job.createdAt, job.updatedAt, job.errorCode, job.errorMessage, job.manifestPath
      );
      if (params.draft) {
        this.db.prepare(`
          INSERT INTO lesson_drafts (lessonId, data, createdAt) VALUES (?, ?, ?)
        `).run(job.lessonId, JSON.stringify(params.draft), now);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return job;
  }

  /** The original agent submission, preserved exactly for processing/replay. */
  getDraft(lessonId: string): LessonDraftV1 | null {
    const row = this.db.prepare('SELECT data FROM lesson_drafts WHERE lessonId = ?')
      .get(lessonId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as LessonDraftV1 : null;
  }

  getDraftForJob(jobId: string): LessonDraftV1 | null {
    const row = this.db.prepare(`
      SELECT lesson_drafts.data FROM lesson_drafts
      INNER JOIN jobs ON jobs.lessonId = lesson_drafts.lessonId
      WHERE jobs.jobId = ?
    `).get(jobId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as LessonDraftV1 : null;
  }

  getJob(jobId: string): JobRecord | null {
    const row = this.db.prepare(`SELECT * FROM jobs WHERE jobId = ?`).get(jobId) as JobRecord | undefined;
    return row ?? null;
  }

  findJobBySubmissionId(submissionId: string, projectId?: string, snapshotId?: string): JobRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM jobs WHERE submissionId = ?
        AND (? IS NULL OR projectId = ?)
        AND (? IS NULL OR snapshotId = ?)
      LIMIT 1
    `).get(submissionId, projectId ?? null, projectId ?? null, snapshotId ?? null, snapshotId ?? null) as JobRecord | undefined;
    return row ?? null;
  }

  listJobs(): JobRecord[] {
    return this.db.prepare(`SELECT * FROM jobs ORDER BY createdAt DESC`).all() as JobRecord[];
  }

  /**
   * Conditional state transition — only updates if current state matches expected.
   * Returns true if the transition was applied.
   */
  transitionJob(
    jobId: string,
    fromState: JobState,
    toState: JobState,
    updates: {
      errorCode?: string | null;
      errorMessage?: string | null;
      manifestPath?: string | null;
      attemptIncrement?: boolean;
    } = {}
  ): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE jobs
      SET state = ?,
          updatedAt = ?,
          errorCode = COALESCE(?, errorCode),
          errorMessage = COALESCE(?, errorMessage),
          manifestPath = COALESCE(?, manifestPath),
          attemptCount = attemptCount + ?
      WHERE jobId = ? AND state = ?
    `).run(
      toState,
      now,
      updates.errorCode ?? null,
      updates.errorMessage ?? null,
      updates.manifestPath ?? null,
      updates.attemptIncrement ? 1 : 0,
      jobId,
      fromState
    );
    return (result as { changes: number }).changes > 0;
  }

  /**
   * On restart, move any stuck "processing" jobs to "needs_review".
   */
  recoverInterruptedJobs(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE jobs SET state = 'needs_review', updatedAt = ?,
        errorCode = 'INTERRUPTED', errorMessage = 'Job interrupted by service restart'
      WHERE state = 'processing'
    `).run(now);
    return (result as { changes: number }).changes;
  }

  /**
   * Return all jobs in the queued state, oldest first.
   */
  getQueuedJobs(mode?: JobMode): JobRecord[] {
    return this.db.prepare(`
      SELECT * FROM jobs WHERE state = 'queued'
        AND (? IS NULL OR mode = ?) ORDER BY createdAt ASC
    `).all(mode ?? null, mode ?? null) as JobRecord[];
  }

  close(): void {
    this.db.close();
  }
}
