/**
 * Player smoke test — manifest-driven UI flow.
 * Tests that a mock manifest renders correctly in the LessonCard.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ApiLessonDetail } from './api.js';
import type { PlaybackManifestV1 } from '@brainrot/contracts';

// We test LessonCard directly rather than the full App (which needs a running server)
// Import dynamically to avoid Vite module resolution issues in the test environment
const getModule = async () => (await import('./components/LessonCard.js'));

const mockManifest: PlaybackManifestV1 = {
  schemaVersion: 'PlaybackManifestV1',
  lessonId: '00000000-0000-0000-0000-000000000004',
  jobId: '00000000-0000-0000-0000-000000000005',
  snapshotId: '00000000-0000-0000-0000-000000000003',
  createdAt: new Date().toISOString(),
  title: 'Understanding the Fibonacci function',
  objective: 'Learn about recursive Fibonacci.',
  scene: 'default',
  mode: 'mock',
  durationSeconds: 10,
  dialogue: [
    { id: 'seg-1', speaker: 'rookie', text: 'Why recursion?', startMs: 0, endMs: 3000 },
    { id: 'seg-2', speaker: 'debugger', text: 'It mirrors the math.', startMs: 3200, endMs: 7000 },
    { id: 'seg-3', speaker: 'rookie', text: 'What is the complexity?', startMs: 7200, endMs: 10000 },
  ],
  question: {
    id: 'q-1',
    text: 'What is the time complexity?',
    choices: [
      { id: 'c-a', text: 'O(n)' },
      { id: 'c-b', text: 'O(2ⁿ)' },
    ],
    correctChoiceId: 'c-b',
    explanation: 'Exponential because each call branches twice.',
    citationIds: [],
  },
  citations: [
    {
      citationId: '00000000-0000-0000-0000-000000000010',
      path: 'src/fibonacci.ts',
      symbol: 'fibonacci',
      startLine: 1,
      endLine: 10,
      contentHash: 'a'.repeat(64),
      excerpt: 'export function fibonacci(n: number): number { ... }',
      verificationStatus: 'verified',
    },
  ],
  audioUrl: null,
  audioFormat: null,
};

const mockDetail: ApiLessonDetail = {
  job: {
    jobId: '00000000-0000-0000-0000-000000000005',
    lessonId: '00000000-0000-0000-0000-000000000004',
    state: 'ready',
    mode: 'mock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    submissionId: 'seed-test',
  },
  manifest: mockManifest,
  staleSourceIds: [],
};

describe('LessonCard smoke test', () => {
  it('renders the lesson title', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    expect(screen.getByRole('article')).toBeDefined();
    expect(screen.getByText('Understanding the Fibonacci function')).toBeDefined();
  });

  it('shows the mock badge', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    expect(screen.getByRole('note')).toBeDefined();
    expect(screen.getByText(/Text-only preview/)).toBeDefined();
  });

  it('shows the objective', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    expect(screen.getByText(/Learn about recursive Fibonacci/)).toBeDefined();
  });

  it('shows Play button initially', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    // aria-label is "Play" (distinct from aria-label "Replay from beginning")
    expect(screen.getByRole('button', { name: 'Play' })).toBeDefined();
  });

  it('shows two character displays', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    expect(screen.getByLabelText(/rookie character/i)).toBeDefined();
    expect(screen.getByLabelText(/debugger character/i)).toBeDefined();
  });

  it('has evidence drawer toggle button', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    expect(screen.getByRole('button', { name: /Show source evidence/i })).toBeDefined();
  });

  it('shows evidence when drawer is opened', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    const toggle = screen.getByRole('button', { name: /Show source evidence/i });
    fireEvent.click(toggle);
    expect(screen.getByText(/src\/fibonacci\.ts/)).toBeDefined();
  });

  it('shows transcript', async () => {
    const { LessonCard } = await getModule();
    render(<LessonCard detail={mockDetail} onRefresh={() => {}} />);
    expect(screen.getByText(/View full transcript/)).toBeDefined();
  });

  it('shows a failed-job state for failed jobs', async () => {
    const { LessonCard } = await getModule();
    const failedDetail: ApiLessonDetail = {
      ...mockDetail,
      job: { ...mockDetail.job, state: 'failed', errorCode: 'PROCESSING_ERROR', errorMessage: 'Internal error' } as ApiJobSummary & { errorCode?: string; errorMessage?: string },
      manifest: null,
    };
    render(<LessonCard detail={failedDetail} onRefresh={() => {}} />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/failed/i)).toBeDefined();
  });

  it('shows stale source warning when staleSourceIds is non-empty', async () => {
    const { LessonCard } = await getModule();
    const staleDetail: ApiLessonDetail = {
      ...mockDetail,
      staleSourceIds: ['00000000-0000-0000-0000-000000000010'],
    };
    render(<LessonCard detail={staleDetail} onRefresh={() => {}} />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/outdated/i)).toBeDefined();
  });
});

// Helper type alias needed for test
type ApiJobSummary = ApiLessonDetail['job'];
