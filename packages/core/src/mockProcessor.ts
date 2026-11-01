/**
 * Mock processor — deterministic manifest builder.
 *
 * Produces a PlaybackManifestV1 with synthetic caption timing.
 * Never makes paid API calls or network requests.
 * Jobs processed here keep mode: "mock" permanently.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  LessonDraftV1,
  EvidenceSnapshotV1,
  PlaybackManifestV1,
  TimedSegment,
} from '@brainrot/contracts';

/** Synthetic timing: ~150 words/min ≈ 400ms/word, minimum 1s/segment */
function syntheticTiming(text: string, startMs: number): { startMs: number; endMs: number } {
  const words = text.split(/\s+/).filter(Boolean).length;
  const durationMs = Math.max(1000, words * 400);
  return { startMs, endMs: startMs + durationMs };
}

/**
 * Build a PlaybackManifestV1 from a validated lesson draft and its evidence snapshot.
 * All timing is synthetic; audioUrl is null.
 */
export function buildMockManifest(
  draft: LessonDraftV1,
  snapshot: EvidenceSnapshotV1,
  jobId: string
): PlaybackManifestV1 {
  let cursor = 0;
  const dialogue: TimedSegment[] = draft.dialogue.map((seg) => {
    const timing = syntheticTiming(seg.text, cursor);
    cursor = timing.endMs + 200; // 200ms gap between segments
    return {
      id: seg.id,
      speaker: seg.speaker,
      text: seg.text,
      startMs: timing.startMs,
      endMs: timing.endMs,
    };
  });

  const durationSeconds = cursor / 1000;

  // Include only citations referenced by this draft
  const referencedCitationIds = new Set([
    ...draft.dialogue.flatMap((s) => s.citationIds),
    ...draft.question.citationIds,
  ]);

  const citations = snapshot.citations
    .filter((c) => referencedCitationIds.has(c.citationId))
    .map((c) => ({
      citationId: c.citationId,
      path: c.path, // repo-relative only
      symbol: c.symbol,
      startLine: c.startLine,
      endLine: c.endLine,
      contentHash: c.contentHash,
      excerpt: c.excerpt,
      verificationStatus: c.verificationStatus,
    }));

  const manifest: PlaybackManifestV1 = {
    schemaVersion: 'PlaybackManifestV1',
    lessonId: draft.submissionId, // overridden by caller with real lessonId
    jobId,
    snapshotId: draft.snapshotId,
    createdAt: new Date().toISOString(),
    title: draft.title,
    objective: draft.objective,
    scene: draft.scene,
    mode: 'mock',
    durationSeconds,
    dialogue,
    question: {
      id: draft.question.id,
      text: draft.question.text,
      choices: draft.question.choices,
      correctChoiceId: draft.question.correctChoiceId,
      explanation: draft.question.explanation,
      citationIds: draft.question.citationIds,
    },
    citations,
    audioUrl: null,
    audioFormat: null,
  };

  return manifest;
}

/**
 * Persist a manifest to the data directory.
 * Returns the relative path (from the data dir) used as manifestPath in the job record.
 */
export function persistManifest(
  dataDir: string,
  lessonId: string,
  manifest: PlaybackManifestV1
): string {
  const manifestsDir = path.join(dataDir, 'manifests');
  fs.mkdirSync(manifestsDir, { recursive: true });
  const filename = `${lessonId}.json`;
  const absPath = path.join(manifestsDir, filename);
  fs.writeFileSync(absPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return path.join('manifests', filename);
}

/**
 * Load a manifest from the data directory.
 */
export function loadManifest(
  dataDir: string,
  relativePath: string
): PlaybackManifestV1 | null {
  try {
    const absPath = path.join(dataDir, relativePath);
    const content = fs.readFileSync(absPath, 'utf-8');
    return JSON.parse(content) as PlaybackManifestV1;
  } catch {
    return null;
  }
}
