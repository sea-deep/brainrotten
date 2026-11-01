/**
 * Express HTTP routes — companion API.
 *
 * All mutation routes require:
 *   - Authorization: Bearer <token>
 *   - Origin/Host validation (loopback only)
 *
 * No wildcard CORS. No secrets in responses.
 */
import { Router, json as jsonParser } from 'express';
import type { Request, Response } from 'express';
import type { BrainrotStorage } from '@brainrot/core';
import {
  captureSnapshot,
  checkSnapshotFreshness,
  validateDraft,
  submitJob,
  loadManifest,
  resolveRepoRoot,
} from '@brainrot/core';
import type { CompanionConfig } from '../config.js';
import type { SessionAuth } from '../auth.js';
import { logger } from '../logger.js';

export function createRouter(
  storage: BrainrotStorage,
  config: CompanionConfig,
  auth: SessionAuth
): Router {
  const router = Router();
  router.use(jsonParser({ limit: '256kb' }));

  // ── Health (no auth) ──────────────────────────────────────────────────────
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', mode: 'mock', version: '0.1.0' });
  });

  // ── Bootstrap: provide session token for the web app ─────────────────────
  // Single-use endpoint for the local web player to retrieve its session token.
  // Returns the token only to loopback callers. The token is embedded in a
  // cookie via Set-Cookie rather than in the JSON body to keep it out of logs.
  router.get(
    '/bootstrap',
    auth.requireLoopbackOrigin,
    (_req: Request, res: Response) => {
      // In a full implementation this would be a one-time nonce.
      // For the scaffold, we return it directly; the web app stores it in sessionStorage.
      res.cookie('brainrot_session', auth.getToken(), {httpOnly: true, sameSite: 'strict', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000});
      res.setHeader('Cache-Control', 'no-store');
      res.json({ token: auth.getToken() });
    }
  );

  // ── Lessons list ──────────────────────────────────────────────────────────
  router.get(
    '/lessons',
    auth.requireAuth,
    (_req: Request, res: Response) => {
      const jobs = storage.listJobs();
      res.json({ jobs });
    }
  );

  // ── Lesson detail ─────────────────────────────────────────────────────────
  router.get(
    '/lessons/:jobId',
    auth.requireAuth,
    (req: Request, res: Response) => {
      const { jobId } = req.params as { jobId: string };
      const job = storage.getJob(jobId);
      if (!job) {
        res.status(404).json({
          code: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
          retryable: false,
        });
        return;
      }

      let manifest = null;
      if (job.manifestPath) {
        manifest = loadManifest(config.dataDir, job.manifestPath);
      }

      // Check source freshness if we have a manifest with citations
      let staleSourceIds: string[] | undefined;
      if (manifest && manifest.citations.length > 0) {
        const snapshot = storage.getSnapshot(job.snapshotId);
        if (snapshot) {
          const project = storage.getProject(job.projectId);
          if (project) {
            try {
              const root = resolveRepoRoot(project.repoPath);
              staleSourceIds = checkSnapshotFreshness(root, snapshot);
            } catch {
              // Repo may have moved; don't crash
            }
          }
        }
      }

      res.json({ job, manifest, staleSourceIds: staleSourceIds ?? [] });
    }
  );

  // ── Lesson status ─────────────────────────────────────────────────────────
  router.get(
    '/lessons/:jobId/status',
    auth.requireAuth,
    (req: Request, res: Response) => {
      const { jobId } = req.params as { jobId: string };
      const job = storage.getJob(jobId);
      if (!job) {
        res.status(404).json({
          code: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
          retryable: false,
        });
        return;
      }

      const manifestUrl = job.manifestPath ? `/api/v1/lessons/${jobId}` : null;

      res.json({
        jobId: job.jobId,
        lessonId: job.lessonId,
        state: job.state,
        mode: job.mode,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        manifestUrl,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
      });
    }
  );

  // ── Submit lesson ─────────────────────────────────────────────────────────
  router.post(
    '/lessons',
    auth.requireLoopbackOrigin,
    auth.requireAuth,
    async (req: Request, res: Response) => {
      const raw = req.body;

      // Find the snapshot
      const snapshotId = raw?.snapshotId;
      if (!snapshotId) {
        res.status(400).json({
          code: 'SCHEMA_INVALID',
          message: 'snapshotId is required',
          retryable: false,
        });
        return;
      }

      const snapshot = storage.getSnapshot(snapshotId as string);
      if (!snapshot) {
        res.status(404).json({
          code: 'SNAPSHOT_NOT_FOUND',
          message: `Snapshot ${snapshotId as string} not found`,
          retryable: false,
        });
        return;
      }

      const validation = validateDraft(raw, snapshot);
      if (!validation.ok) {
        res.status(422).json(validation.error);
        return;
      }

      // Check source freshness
      const project = storage.getProject(snapshot.projectId);
      if (project) {
        try {
          const root = resolveRepoRoot(project.repoPath);
          const staleIds = checkSnapshotFreshness(root, snapshot);
          if (staleIds.length > 0) {
            res.status(409).json({
              code: 'STALE_SOURCE',
              message: 'Cited files have changed since the snapshot was taken',
              retryable: false,
              fieldErrors: { citationIds: staleIds },
            });
            return;
          }
        } catch {
          // If we can't check freshness, proceed (don't block submission)
        }
      }

      const result = submitJob(storage, validation.draft, 'mock');
      if (!result.ok) {
        res.status(409).json(result.error);
        return;
      }

      const statusCode = result.isExisting ? 200 : 201;
      res.status(statusCode).json({
        jobId: result.job.jobId,
        lessonId: result.job.lessonId,
        state: result.job.state,
        mode: result.job.mode,
        submittedAt: result.job.createdAt,
        isExisting: result.isExisting,
      });
    }
  );

  // ── Get change context ────────────────────────────────────────────────────
  router.post(
    '/context',
    auth.requireLoopbackOrigin,
    auth.requireAuth,
    (req: Request, res: Response) => {
      const { projectId, comparisonMode } = req.body as {
        projectId?: string;
        comparisonMode?: string;
      };

      if (!projectId) {
        res.status(400).json({
          code: 'SCHEMA_INVALID',
          message: 'projectId is required',
          retryable: false,
        });
        return;
      }

      const project = storage.getProject(projectId);
      if (!project) {
        res.status(404).json({
          code: 'PROJECT_NOT_FOUND',
          message: `Project ${projectId} not found`,
          retryable: false,
        });
        return;
      }

      let repoRoot: string;
      try {
        repoRoot = resolveRepoRoot(project.repoPath);
      } catch {
        res.status(500).json({
          code: 'REPO_UNAVAILABLE',
          message: 'Repository path could not be resolved',
          retryable: false,
        });
        return;
      }

      const mode =
        comparisonMode === 'dirty-working-tree' ? 'dirty-working-tree' : 'git-head';

      try {
        const snapshot = captureSnapshot(projectId, repoRoot, mode);
        storage.saveSnapshot(snapshot);
        logger.info('Snapshot captured', { snapshotId: snapshot.snapshotId, citations: snapshot.citations.length });
        res.json(snapshot);
      } catch (err) {
        logger.error('Snapshot capture failed', { error: String(err) });
        res.status(500).json({
          code: 'SNAPSHOT_ERROR',
          message: 'Failed to capture source snapshot',
          retryable: true,
        });
      }
    }
  );

  // ── Register project ──────────────────────────────────────────────────────
  router.post(
    '/projects',
    auth.requireLoopbackOrigin,
    auth.requireAuth,
    (req: Request, res: Response) => {
      const { label, repoPath } = req.body as { label?: string; repoPath?: string };
      if (!label || !repoPath) {
        res.status(400).json({
          code: 'SCHEMA_INVALID',
          message: 'label and repoPath are required',
          retryable: false,
        });
        return;
      }

      try {
        const resolvedPath = resolveRepoRoot(repoPath);
        // Idempotent: return existing if same path
        const existing = storage.findProjectByRepoPath(resolvedPath);
        if (existing) {
          res.status(200).json(existing);
          return;
        }
        const project = storage.registerProject(label, resolvedPath);
        res.status(201).json(project);
      } catch (err) {
        res.status(400).json({
          code: 'INVALID_REPO_PATH',
          message: String(err),
          retryable: false,
        });
      }
    }
  );

  return router;
}
