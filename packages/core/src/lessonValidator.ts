/**
 * Lesson validator — Zod parse + citation reference check + character budget.
 */
import { LessonDraftV1Schema, type LessonDraftV1 } from '@brainrot/contracts';
import type { EvidenceSnapshotV1 } from '@brainrot/contracts';
import type { StructuredError } from '@brainrot/contracts';

export interface ValidationResult {
  ok: true;
  draft: LessonDraftV1;
}

export interface ValidationFailure {
  ok: false;
  error: StructuredError;
}

export type ValidateDraftResult = ValidationResult | ValidationFailure;

/**
 * Validate a raw (unknown) lesson draft payload.
 * Returns a typed LessonDraftV1 on success or a StructuredError on failure.
 */
export function validateDraft(
  raw: unknown,
  snapshot: EvidenceSnapshotV1
): ValidateDraftResult {
  // 1. Schema validation
  const parseResult = LessonDraftV1Schema.safeParse(raw);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        message: 'Lesson draft failed schema validation',
        retryable: false,
        fieldErrors: Object.fromEntries(
          parseResult.error.issues.map((issue) => [
            issue.path.join('.') || 'root',
            [issue.message],
          ])
        ),
      },
    };
  }

  const draft = parseResult.data;

  // 2. Project/snapshot must match
  if (draft.projectId !== snapshot.projectId) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_MISMATCH',
        message: 'draft.projectId does not match the snapshot projectId',
        retryable: false,
      },
    };
  }

  if (draft.snapshotId !== snapshot.snapshotId) {
    return {
      ok: false,
      error: {
        code: 'SNAPSHOT_MISMATCH',
        message: 'draft.snapshotId does not match the provided snapshot',
        retryable: false,
      },
    };
  }

  // 3. Citation ID references must exist in the snapshot
  const knownCitationIds = new Set(snapshot.citations.map((c) => c.citationId));
  const unknownIds: string[] = [];

  for (const segment of draft.dialogue) {
    for (const cid of segment.citationIds) {
      if (!knownCitationIds.has(cid)) {
        unknownIds.push(cid);
      }
    }
  }
  for (const cid of draft.question.citationIds) {
    if (!knownCitationIds.has(cid)) {
      unknownIds.push(cid);
    }
  }

  if (unknownIds.length > 0) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_CITATION_IDS',
        message: `Citation IDs not found in snapshot: ${[...new Set(unknownIds)].join(', ')}`,
        retryable: false,
        fieldErrors: {
          citationIds: [`Unknown citation IDs: ${[...new Set(unknownIds)].join(', ')}`],
        },
      },
    };
  }

  return { ok: true, draft };
}
