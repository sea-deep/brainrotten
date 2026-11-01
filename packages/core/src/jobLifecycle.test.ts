import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BrainrotStorage } from './storage.js';
import { submitJob, hashDraft } from './jobLifecycle.js';
import { buildMockManifest } from './mockProcessor.js';
import type { EvidenceSnapshotV1, LessonDraftV1 } from '@brainrot/contracts';

let tmpDir: string;
let storage: BrainrotStorage;

const baseDraft: LessonDraftV1 = {
  schemaVersion: 'LessonDraftV1',
  projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  snapshotId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  submissionId: 'test-idempotency-key-001',
  title: 'Async/Await explained',
  language: 'en',
  objective: 'Understand how async/await works.',
  scene: 'default',
  dialogue: [
    { id: 'seg-1', speaker: 'rookie', text: 'Why use async await?', citationIds: [] },
    { id: 'seg-2', speaker: 'debugger', text: 'It flattens Promise chains.', citationIds: [] },
  ],
  question: {
    id: 'q-1',
    text: 'What does await do?',
    choices: [
      { id: 'c-a', text: 'Blocks the thread' },
      { id: 'c-b', text: 'Suspends the async function' },
    ],
    correctChoiceId: 'c-b',
    explanation: 'await suspends the async function, not the thread.',
    citationIds: [],
  },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainrot-lifecycle-'));
  storage = new BrainrotStorage(path.join(tmpDir, 'db.sqlite'));
});

afterEach(() => {
  storage.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('submitJob idempotency', () => {
  it('creates a new job on first submission', () => {
    const result = submitJob(storage, baseDraft, 'mock');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.isExisting).toBe(false);
    expect(result.job.state).toBe('queued');
    expect(result.job.mode).toBe('mock');
    expect(result.job.submissionId).toBe(baseDraft.submissionId);
  });

  it('returns the same job on duplicate submission', () => {
    const r1 = submitJob(storage, baseDraft, 'mock');
    const r2 = submitJob(storage, baseDraft, 'mock');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) throw new Error();
    expect(r2.isExisting).toBe(true);
    expect(r2.job.jobId).toBe(r1.job.jobId);
  });

  it('rejects a different payload under the same submission key', () => {
    submitJob(storage, baseDraft, 'mock');
    const different = { ...baseDraft, title: 'A completely different title' };
    const result = submitJob(storage, different, 'mock');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects changed dialogue or question content under an existing key', () => {
    submitJob(storage, baseDraft, 'mock');
    const changed = structuredClone(baseDraft);
    changed.dialogue[1]!.text = 'It waits for the promise to settle.';
    const result = submitJob(storage, changed, 'mock');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('scopes submission keys to the project and snapshot', () => {
    const first = submitJob(storage, baseDraft, 'mock');
    const second = submitJob(storage, {
      ...baseDraft,
      projectId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    }, 'mock');
    const third = submitJob(storage, {
      ...baseDraft,
      snapshotId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    }, 'mock');
    if (!first.ok || !second.ok || !third.ok) throw new Error();
    expect(new Set([first.job.jobId, second.job.jobId, third.job.jobId]).size).toBe(3);
  });
});

describe('original draft persistence', () => {
  it('keeps the full original draft through a database reopen', () => {
    const result = submitJob(storage, baseDraft, 'mock');
    if (!result.ok) throw new Error();
    expect(storage.getDraft(result.job.lessonId)).toEqual(baseDraft);

    storage.close();
    storage = new BrainrotStorage(path.join(tmpDir, 'db.sqlite'));
    expect(storage.getDraftForJob(result.job.jobId)).toEqual(baseDraft);
    expect(storage.getDraftForJob('unknown-job')).toBeNull();
    expect(storage.getDraft('unknown-lesson')).toBeNull();
  });

  it('rolls back a job if its draft cannot be stored atomically', () => {
    const result = submitJob(storage, baseDraft, 'mock');
    if (!result.ok) throw new Error();
    expect(() => storage.createJob({
      ...result.job,
      submissionId: 'second-submission',
      draft: baseDraft,
    })).toThrow();
    expect(storage.listJobs()).toHaveLength(1);
    expect(storage.getDraftForJob(result.job.jobId)).toEqual(baseDraft);
  });

  it('replays submitted dialogue, question, and referenced evidence into the mock manifest', () => {
    const citationId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const draft = structuredClone(baseDraft);
    draft.dialogue[1]!.citationIds = [citationId];
    draft.question.citationIds = [citationId];
    const snapshot: EvidenceSnapshotV1 = {
      schemaVersion: 'EvidenceSnapshotV1',
      snapshotId: draft.snapshotId,
      projectId: draft.projectId,
      createdAt: new Date().toISOString(),
      baseRevision: null,
      comparisonMode: 'dirty-working-tree',
      citations: [{
        citationId,
        path: 'src/async.ts',
        symbol: 'getUser',
        startLine: 1,
        endLine: 3,
        contentHash: 'f'.repeat(64),
        excerpt: 'return await fetchUser();',
        verificationStatus: 'verified',
      }],
    };
    const result = submitJob(storage, draft, 'mock');
    if (!result.ok) throw new Error();
    const loaded = storage.getDraftForJob(result.job.jobId);
    if (!loaded) throw new Error();
    const manifest = buildMockManifest(loaded, snapshot, result.job.jobId);
    expect(manifest.title).toBe(draft.title);
    expect(manifest.dialogue.map(({ text }) => text)).toEqual(draft.dialogue.map(({ text }) => text));
    expect(manifest.question).toEqual(draft.question);
    expect(manifest.citations).toEqual(snapshot.citations);
    expect(manifest.audioUrl).toBeNull();
    expect(manifest.mode).toBe('mock');
  });
});

describe('job state transitions', () => {
  it('transitions queued → processing → ready', () => {
    const r = submitJob(storage, baseDraft, 'mock');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    const { jobId } = r.job;

    const t1 = storage.transitionJob(jobId, 'queued', 'processing', { attemptIncrement: true });
    expect(t1).toBe(true);
    expect(storage.getJob(jobId)?.state).toBe('processing');

    const t2 = storage.transitionJob(jobId, 'processing', 'ready', {
      manifestPath: 'manifests/test.json',
    });
    expect(t2).toBe(true);
    expect(storage.getJob(jobId)?.state).toBe('ready');
    expect(storage.getJob(jobId)?.manifestPath).toBe('manifests/test.json');
  });

  it('does not transition if the current state does not match', () => {
    const r = submitJob(storage, baseDraft, 'mock');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    const { jobId } = r.job;

    // Try to transition from processing when it's queued
    const t = storage.transitionJob(jobId, 'processing', 'ready');
    expect(t).toBe(false);
    expect(storage.getJob(jobId)?.state).toBe('queued'); // unchanged
  });

  it('recovers interrupted jobs on restart', () => {
    const r = submitJob(storage, baseDraft, 'mock');
    if (!r.ok) throw new Error();
    storage.transitionJob(r.job.jobId, 'queued', 'processing');

    // Simulate restart by calling recover
    const recovered = storage.recoverInterruptedJobs();
    expect(recovered).toBe(1);
    expect(storage.getJob(r.job.jobId)?.state).toBe('needs_review');
    expect(storage.getJob(r.job.jobId)?.errorCode).toBe('INTERRUPTED');
  });
});

describe('hashDraft', () => {
  it('produces a 64-char hex string', () => {
    const hash = hashDraft(baseDraft);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces the same hash for the same draft', () => {
    expect(hashDraft(baseDraft)).toBe(hashDraft({ ...baseDraft }));
  });

  it('produces a different hash when content changes', () => {
    const modified = { ...baseDraft, title: 'Different title' };
    expect(hashDraft(baseDraft)).not.toBe(hashDraft(modified));
  });

  it('includes nested dialogue, answers, and citations in the hash', () => {
    for (const mutate of [
      (draft: LessonDraftV1) => { draft.dialogue[0]!.text = 'Changed nested dialogue'; },
      (draft: LessonDraftV1) => { draft.question.explanation = 'Changed nested explanation'; },
      (draft: LessonDraftV1) => { draft.dialogue[0]!.citationIds = ['new-citation']; },
    ]) {
      const draft = structuredClone(baseDraft);
      mutate(draft);
      expect(hashDraft(draft)).not.toBe(hashDraft(baseDraft));
    }
  });

  it('ignores object key insertion order, including inside nested objects', () => {
    const reordered = {
      ...baseDraft,
      dialogue: baseDraft.dialogue.map(({ citationIds, text, speaker, id }) => ({ citationIds, text, speaker, id })),
      question: {
        citationIds: baseDraft.question.citationIds,
        explanation: baseDraft.question.explanation,
        correctChoiceId: baseDraft.question.correctChoiceId,
        choices: baseDraft.question.choices,
        text: baseDraft.question.text,
        id: baseDraft.question.id,
      },
    };
    expect(hashDraft(reordered)).toBe(hashDraft(baseDraft));
  });
});
