import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrainrotStorage, loadManifest, submitJob } from '@brainrot/core';
import type { EvidenceSnapshotV1, LessonDraftV1 } from '@brainrot/contracts';
import { MockJobProcessor } from './processor.js';

let dataDir: string;
let storage: BrainrotStorage;
let processor: MockJobProcessor;
let draft: LessonDraftV1;
let snapshot: EvidenceSnapshotV1;

beforeEach(() => {
  vi.useFakeTimers();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainrot-processor-'));
  storage = new BrainrotStorage(path.join(dataDir, 'db.sqlite'));
  processor = new MockJobProcessor(storage, dataDir);
  const project = storage.registerProject('Fixture', dataDir);
  snapshot = {
    schemaVersion: 'EvidenceSnapshotV1',
    snapshotId: randomUUID(),
    projectId: project.projectId,
    createdAt: new Date().toISOString(),
    baseRevision: null,
    comparisonMode: 'git-head',
    citations: [],
  };
  storage.saveSnapshot(snapshot);
  draft = {
    schemaVersion: 'LessonDraftV1',
    submissionId: 'an-actual-submission',
    projectId: project.projectId,
    snapshotId: snapshot.snapshotId,
    title: 'The retry stops after three attempts',
    objective: 'Understand the precise retry limit.',
    language: 'en',
    scene: 'default',
    dialogue: [{ id: 'line-1', speaker: 'debugger', text: 'After the third failure, the error is thrown.', citationIds: [] }],
    question: {
      id: 'question-1',
      text: 'How many attempts are made?',
      choices: [{ id: 'three', text: 'Three' }, { id: 'forever', text: 'Unlimited' }],
      correctChoiceId: 'three',
      explanation: 'The loop permits three attempts.',
      citationIds: [],
    },
  };
});

afterEach(() => {
  processor.stop();
  vi.useRealTimers();
  storage.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('mock processor original-content replay', () => {
  it('processes the exact persisted draft rather than synthetic fallback text', async () => {
    const result = submitJob(storage, draft, 'mock');
    if (!result.ok) throw new Error();
    processor.start();
    await vi.advanceTimersByTimeAsync(1000);
    const completed = storage.getJob(result.job.jobId);
    expect(completed?.state).toBe('ready');
    expect(completed?.mode).toBe('mock');
    const manifest = loadManifest(dataDir, completed!.manifestPath!);
    expect(manifest?.title).toBe(draft.title);
    expect(manifest?.dialogue[0]?.text).toBe(draft.dialogue[0]!.text);
    expect(manifest?.question).toEqual(draft.question);
    expect(manifest?.lessonId).toBe(result.job.lessonId);
  });

  it('fails a legacy job without a draft instead of inventing lesson content', async () => {
    const job = storage.createJob({
      lessonId: randomUUID(),
      projectId: snapshot.projectId,
      snapshotId: snapshot.snapshotId,
      submissionId: 'legacy-submission',
      payloadHash: 'f'.repeat(64),
      mode: 'mock',
    });
    processor.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.getJob(job.jobId)?.state).toBe('failed');
    expect(storage.getJob(job.jobId)?.errorCode).toBe('DRAFT_NOT_FOUND');
    expect(storage.getJob(job.jobId)?.manifestPath).toBeNull();
  });

  it('never takes ownership of live jobs', async () => {
    const result = submitJob(storage, draft, 'live');
    if (!result.ok) throw new Error();
    processor.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(storage.getJob(result.job.jobId)?.state).toBe('queued');
    expect(storage.getJob(result.job.jobId)?.mode).toBe('live');
  });
});
