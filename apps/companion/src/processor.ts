/**
 * Mock job processor loop.
 * Polls for queued jobs, processes them deterministically, and updates state.
 * Runs in the same process as the HTTP server.
 */
import type { BrainrotStorage } from '@brainrot/core';
import { buildMockManifest, persistManifest } from '@brainrot/core';
import { LessonDraftV1Schema } from '@brainrot/contracts';
import { logger } from './logger.js';

const POLL_INTERVAL_MS = 1000;

export class MockJobProcessor {
  private storage: BrainrotStorage;
  private dataDir: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(storage: BrainrotStorage, dataDir: string) {
    this.storage = storage;
    this.dataDir = dataDir;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
    logger.info('Mock job processor started');
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('Mock job processor stopped');
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.processNext().catch((err) =>
        logger.error('Processor error', { error: String(err) })
      );
    }, POLL_INTERVAL_MS);
  }

  private async processNext(): Promise<void> {
    if (!this.running) return;
    try {
      await this.tick();
    } finally {
      if (this.running) this.schedule();
    }
  }

  private async tick(): Promise<void> {
    const queued = this.storage.getQueuedJobs('mock');
    for (const job of queued.slice(0, 1)) { // process one at a time
      logger.info('Processing job', { jobId: job.jobId });

      // Acquire processing state
      const acquired = this.storage.transitionJob(
        job.jobId,
        'queued',
        'processing',
        { attemptIncrement: true }
      );
      if (!acquired) continue; // another process may have grabbed it (future-proofing)

      try {
        // Retrieve snapshot
        const snapshot = this.storage.getSnapshot(job.snapshotId);
        if (!snapshot) {
          this.storage.transitionJob(job.jobId, 'processing', 'failed', {
            errorCode: 'SNAPSHOT_NOT_FOUND',
            errorMessage: `Snapshot ${job.snapshotId} not found`,
          });
          continue;
        }

        const storedDraft = this.storage.getDraftForJob(job.jobId);
        if (!storedDraft) {
          this.storage.transitionJob(job.jobId, 'processing', 'failed', {
            errorCode: 'DRAFT_NOT_FOUND',
            errorMessage: 'Original lesson draft is unavailable. Submit a new lesson.',
          });
          continue;
        }
        const draft = LessonDraftV1Schema.parse(storedDraft);
        const manifest = buildMockManifest(draft, snapshot, job.jobId);

        // Override lessonId with the real one
        const finalManifest = { ...manifest, lessonId: job.lessonId };

        const relativePath = persistManifest(this.dataDir, job.lessonId, finalManifest);

        const success = this.storage.transitionJob(
          job.jobId,
          'processing',
          'ready',
          { manifestPath: relativePath }
        );

        if (success) {
          logger.info('Job completed', { jobId: job.jobId, manifestPath: relativePath });
        }
      } catch (err) {
        logger.error('Job processing failed', { jobId: job.jobId, error: String(err) });
        this.storage.transitionJob(job.jobId, 'processing', 'failed', {
          errorCode: 'PROCESSING_ERROR',
          errorMessage: 'Internal processing error',
        });
      }
    }
  }

}
