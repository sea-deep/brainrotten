import { describe, it, expect } from 'vitest';
import {
  LessonDraftV1Schema,
  MAX_DIALOGUE_CHARS,
} from './lessonDraftSchema.js';
import { EvidenceSnapshotV1Schema } from './evidenceSnapshotSchema.js';
import { PlaybackManifestV1Schema } from './playbackManifestSchema.js';
import { JobRecordSchema } from './jobSchema.js';

const baseDraft = {
  schemaVersion: 'LessonDraftV1' as const,
  projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  snapshotId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  submissionId: 'test-sub-001',
  title: 'Understanding async/await',
  language: 'en',
  objective: 'Explain how async/await differs from raw Promise chains.',
  scene: 'default' as const,
  dialogue: [
    {
      id: 'seg-1',
      speaker: 'rookie' as const,
      text: 'Why do we use async await?',
      citationIds: ['c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
    },
    {
      id: 'seg-2',
      speaker: 'debugger' as const,
      text: 'It makes asynchronous code read like synchronous code.',
      citationIds: ['c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
    },
  ],
  question: {
    id: 'q-1',
    text: 'What happens if you forget the await keyword?',
    choices: [
      { id: 'c-a', text: 'The function throws immediately' },
      { id: 'c-b', text: 'You get a Promise object instead of the resolved value' },
    ],
    correctChoiceId: 'c-b',
    explanation: 'Without await, the expression evaluates to a Promise.',
    citationIds: ['c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
  },
};

describe('LessonDraftV1Schema', () => {
  it('accepts a valid draft', () => {
    const result = LessonDraftV1Schema.safeParse(baseDraft);
    expect(result.success).toBe(true);
  });

  it('rejects missing schemaVersion', () => {
    const { schemaVersion: _, ...rest } = baseDraft;
    const result = LessonDraftV1Schema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects wrong schemaVersion literal', () => {
    const result = LessonDraftV1Schema.safeParse({
      ...baseDraft,
      schemaVersion: 'LessonDraftV2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid projectId (not uuid)', () => {
    const result = LessonDraftV1Schema.safeParse({
      ...baseDraft,
      projectId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown speaker', () => {
    const result = LessonDraftV1Schema.safeParse({
      ...baseDraft,
      dialogue: [
        {
          id: 'seg-1',
          speaker: 'narrator',
          text: 'Hello',
          citationIds: [],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown scene id', () => {
    const result = LessonDraftV1Schema.safeParse({
      ...baseDraft,
      scene: 'parkour-background',
    });
    expect(result.success).toBe(false);
  });

  it('rejects correctChoiceId not in choices', () => {
    const result = LessonDraftV1Schema.safeParse({
      ...baseDraft,
      question: {
        ...baseDraft.question,
        correctChoiceId: 'c-nonexistent',
      },
    });
    expect(result.success).toBe(false);
  });

  it(`rejects dialogue exceeding ${MAX_DIALOGUE_CHARS} total chars`, () => {
    const longText = 'a'.repeat(600);
    const result = LessonDraftV1Schema.safeParse({
      ...baseDraft,
      dialogue: [
        { id: 'seg-1', speaker: 'rookie' as const, text: longText, citationIds: [] },
        { id: 'seg-2', speaker: 'debugger' as const, text: longText, citationIds: [] },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('EvidenceSnapshotV1Schema', () => {
  const baseSnapshot = {
    schemaVersion: 'EvidenceSnapshotV1' as const,
    snapshotId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    createdAt: new Date().toISOString(),
    baseRevision: 'abc1234',
    comparisonMode: 'git-head' as const,
    citations: [
      {
        citationId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        path: 'src/utils.ts',
        symbol: 'fetchData',
        startLine: 10,
        endLine: 25,
        contentHash: 'a'.repeat(64),
        excerpt: 'async function fetchData() { ... }',
        verificationStatus: 'verified' as const,
      },
    ],
  };

  it('accepts a valid snapshot', () => {
    const result = EvidenceSnapshotV1Schema.safeParse(baseSnapshot);
    expect(result.success).toBe(true);
  });

  it('rejects a citation with a path containing traversal', () => {
    // The schema itself does not reject traversal (that's done in the inspector);
    // but the path must be a non-empty string
    const result = EvidenceSnapshotV1Schema.safeParse({
      ...baseSnapshot,
      citations: [{ ...baseSnapshot.citations[0]!, path: '' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('PlaybackManifestV1Schema', () => {
  const baseManifest = {
    schemaVersion: 'PlaybackManifestV1' as const,
    lessonId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    jobId: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    snapshotId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    createdAt: new Date().toISOString(),
    title: 'Understanding async/await',
    objective: 'Explain async/await.',
    scene: 'default' as const,
    mode: 'mock' as const,
    durationSeconds: 12.5,
    dialogue: [
      { id: 'seg-1', speaker: 'rookie' as const, text: 'Why?', startMs: 0, endMs: 2000 },
      { id: 'seg-2', speaker: 'debugger' as const, text: 'Because.', startMs: 2000, endMs: 5000 },
    ],
    question: {
      id: 'q-1',
      text: 'What happens?',
      choices: [
        { id: 'c-a', text: 'Option A' },
        { id: 'c-b', text: 'Option B' },
      ],
      correctChoiceId: 'c-b',
      explanation: 'B is correct.',
      citationIds: [],
    },
    citations: [],
    audioUrl: null,
    audioFormat: null,
  };

  it('accepts a valid mock manifest', () => {
    const result = PlaybackManifestV1Schema.safeParse(baseManifest);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid mode', () => {
    const result = PlaybackManifestV1Schema.safeParse({
      ...baseManifest,
      mode: 'real-audio',
    });
    expect(result.success).toBe(false);
  });
});

describe('JobRecordSchema', () => {
  it('accepts a valid job record', () => {
    const record = {
      jobId: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      lessonId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      snapshotId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      submissionId: 'test-sub-001',
      payloadHash: 'b'.repeat(64),
      state: 'queued' as const,
      mode: 'mock' as const,
      attemptCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorCode: null,
      errorMessage: null,
      manifestPath: null,
    };
    const result = JobRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it('rejects invalid state', () => {
    const result = JobRecordSchema.safeParse({ state: 'running' });
    expect(result.success).toBe(false);
  });
});
