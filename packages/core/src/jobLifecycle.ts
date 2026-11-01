/**
 * Job lifecycle — idempotent submission, conditional state transitions.
 */
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type {
  LessonDraftV1,
  JobRecord,
  JobMode,
  StructuredError,
} from '@brainrot/contracts';
import type { BrainrotStorage } from './storage.js';

export interface SubmitResult {
  ok: true;
  job: JobRecord;
  isExisting: boolean;
}

export interface SubmitFailure {
  ok: false;
  error: StructuredError;
}

export type SubmitJobResult = SubmitResult | SubmitFailure;

/**
 * Canonical deterministic hash of a LessonDraftV1.
 * Uses sorted JSON keys so field order does not affect the hash.
 */
export function hashDraft(draft: LessonDraftV1): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]));
    }
    return value;
  };
  const canonical = JSON.stringify(canonicalize(draft));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Idempotent job submission.
 *
 * - Same submissionId + same payloadHash → return existing job (no duplicate)
 * - Same submissionId + different payloadHash → IDEMPOTENCY_CONFLICT error
 * - New submissionId → create job
 */
export function submitJob(
  storage: BrainrotStorage,
  draft: LessonDraftV1,
  mode: JobMode = 'mock'
): SubmitJobResult {
  const payloadHash = hashDraft(draft);
  const existing = storage.findJobBySubmissionId(draft.submissionId, draft.projectId, draft.snapshotId);

  if (existing) {
    if (existing.payloadHash === payloadHash) {
      return { ok: true, job: existing, isExisting: true };
    }
    return {
      ok: false,
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: `Submission key "${draft.submissionId}" was already used with a different payload`,
        retryable: false,
      },
    };
  }

  const lessonId = randomUUID();
  const job = storage.createJob({
    lessonId,
    projectId: draft.projectId,
    snapshotId: draft.snapshotId,
    submissionId: draft.submissionId,
    payloadHash,
    mode,
    draft,
  });

  return { ok: true, job, isExisting: false };
}
