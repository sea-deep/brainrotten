import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ApiLessonDetail } from '../api.js';
import type { TimedSegment } from '@brainrot/contracts';
import { EvidenceDrawer } from './EvidenceDrawer.js';
import { QuestionPanel } from './QuestionPanel.js';
import { CharacterDisplay } from './CharacterDisplay.js';

interface Props {
  detail: ApiLessonDetail;
  onRefresh: () => void;
}

type PresentationMode = 'brainrot' | 'calm';

export function LessonCard({ detail, onRefresh }: Props): React.ReactElement {
  const { job, manifest, staleSourceIds } = detail;
  const [mode, setMode] = useState<PresentationMode>('brainrot');
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);
  const [questionAnswered, setQuestionAnswered] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const maxMs = manifest ? (manifest.durationSeconds ?? 0) * 1000 : 0;

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePlay = useCallback(() => {
    if (!manifest) return;
    setPlaying(true);
    startTimeRef.current = Date.now() - pausedAtRef.current;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed >= maxMs) {
        setCurrentMs(maxMs);
        setPlaying(false);
        stopTimer();
      } else {
        setCurrentMs(elapsed);
      }
    }, 50);
  }, [manifest, maxMs, stopTimer]);

  const handlePause = useCallback(() => {
    pausedAtRef.current = currentMs;
    setPlaying(false);
    stopTimer();
  }, [currentMs, stopTimer]);

  const handleReplay = useCallback(() => {
    stopTimer();
    pausedAtRef.current = 0;
    setCurrentMs(0);
    setPlaying(false);
    setQuestionAnswered(false);
    setTimeout(() => handlePlay(), 50);
  }, [stopTimer, handlePlay]);

  // Clean up on unmount
  useEffect(() => () => stopTimer(), [stopTimer]);

  // Reset when lesson changes
  useEffect(() => {
    stopTimer();
    setPlaying(false);
    setCurrentMs(0);
    pausedAtRef.current = 0;
    setQuestionAnswered(false);
    setShowEvidence(false);
  }, [detail.job.jobId, stopTimer]);

  if (!manifest) {
    if (job.state === 'queued' || job.state === 'processing') {
      return (
        <div className="lesson-card lesson-card--processing" role="status" aria-live="polite">
          <h2>Processing…</h2>
          <p>Job <code>{job.jobId.slice(0, 8)}</code> is {job.state}.</p>
          <button className="btn" onClick={onRefresh}>Check status</button>
        </div>
      );
    }
    if (job.state === 'failed' || job.state === 'needs_review') {
      return (
        <div className="lesson-card lesson-card--error" role="alert">
          <h2>Job {job.state === 'failed' ? 'failed' : 'needs review'}</h2>
          {job.errorCode && <p>Error: {job.errorCode} — {job.errorMessage}</p>}
          <button className="btn" onClick={onRefresh}>Refresh</button>
        </div>
      );
    }
    return (
      <div className="lesson-card">
        <p>Manifest not available yet. State: {job.state}</p>
        <button className="btn" onClick={onRefresh}>Refresh</button>
      </div>
    );
  }

  const activeSegment = findActiveSegment(manifest.dialogue, currentMs);
  const activeSpeaker = activeSegment?.speaker ?? null;
  const hasStale = staleSourceIds && staleSourceIds.length > 0;

  return (
    <article className={`lesson-card lesson-card--${mode}`} aria-label={manifest.title}>

      {/* Mode indicator */}
      {manifest.mode === 'mock' && (
        <div className="mock-badge" role="note" aria-label="Mock mode">
          🎭 Text-only preview (no audio)
        </div>
      )}

      {/* Stale source warning */}
      {hasStale && (
        <div className="stale-badge" role="alert">
          ⚠️ Source evidence may be outdated — {staleSourceIds.length} file(s) changed since lesson was created.
        </div>
      )}

      <header className="lesson-header">
        <h2 className="lesson-title">{manifest.title}</h2>
        <p className="lesson-objective"><em>{manifest.objective}</em></p>
        <div className="lesson-meta">
          <span>Snapshot: <code>{manifest.snapshotId.slice(0, 8)}</code></span>
          <span>Scene: {manifest.scene}</span>
        </div>
      </header>

      {/* Characters */}
      <div className="characters-row">
        <CharacterDisplay
          id="rookie"
          active={activeSpeaker === 'rookie'}
          mode={mode}
        />
        <CharacterDisplay
          id="debugger"
          active={activeSpeaker === 'debugger'}
          mode={mode}
        />
      </div>

      {/* Caption / transcript */}
      <div className="captions-area" aria-live="polite" aria-atomic="true">
        {manifest.dialogue.map((seg) => (
          <CaptionLine
            key={seg.id}
            segment={seg}
            active={seg.id === activeSegment?.id}
            visible={currentMs >= seg.startMs}
            mode={mode}
          />
        ))}
        {currentMs === 0 && !playing && (
          <p className="captions-hint">Press Play to start the lesson.</p>
        )}
      </div>

      {/* Controls */}
      <div className="controls-row" role="group" aria-label="Playback controls">
        {playing ? (
          <button className="btn btn--primary" onClick={handlePause} aria-label="Pause">
            ⏸ Pause
          </button>
        ) : (
          <button className="btn btn--primary" onClick={handlePlay} aria-label="Play" disabled={currentMs >= maxMs && maxMs > 0}>
            ▶ Play
          </button>
        )}
        <button className="btn" onClick={handleReplay} aria-label="Replay from beginning">
          🔁 Replay
        </button>

        {/* Progress */}
        <div className="progress-bar" role="progressbar" aria-valuenow={currentMs} aria-valuemin={0} aria-valuemax={maxMs}>
          <div
            className="progress-fill"
            style={{ width: maxMs > 0 ? `${(currentMs / maxMs) * 100}%` : '0%' }}
          />
        </div>
        <span className="progress-time">{formatTime(currentMs)} / {formatTime(maxMs)}</span>
      </div>

      {/* Presentation mode toggle */}
      <div className="mode-toggle" role="group" aria-label="Presentation mode">
        <button
          className={`mode-btn ${mode === 'brainrot' ? 'mode-btn--active' : ''}`}
          onClick={() => setMode('brainrot')}
          aria-pressed={mode === 'brainrot'}
        >
          🧠 Brainrot
        </button>
        <button
          className={`mode-btn ${mode === 'calm' ? 'mode-btn--active' : ''}`}
          onClick={() => setMode('calm')}
          aria-pressed={mode === 'calm'}
        >
          🧘 Calm
        </button>
      </div>

      {/* Evidence drawer toggle */}
      <div className="evidence-section">
        <button
          className="btn btn--outline"
          onClick={() => setShowEvidence((v) => !v)}
          aria-expanded={showEvidence}
          aria-controls="evidence-drawer"
        >
          🔍 {showEvidence ? 'Hide' : 'Show'} source evidence ({manifest.citations.length})
        </button>
        {showEvidence && (
          <EvidenceDrawer
            id="evidence-drawer"
            citations={manifest.citations}
            staleSourceIds={staleSourceIds ?? []}
          />
        )}
      </div>

      {/* Comprehension question */}
      {(currentMs >= maxMs * 0.8 || questionAnswered) && maxMs > 0 && (
        <QuestionPanel
          question={manifest.question}
          onAnswered={() => setQuestionAnswered(true)}
        />
      )}

      {/* Transcript fallback */}
      <details className="transcript">
        <summary>View full transcript</summary>
        <ol className="transcript-list">
          {manifest.dialogue.map((seg) => (
            <li key={seg.id} className="transcript-item">
              <strong className={`speaker speaker--${seg.speaker}`}>{seg.speaker}:</strong>{' '}
              {seg.text}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

function CaptionLine({
  segment,
  active,
  visible,
  mode,
}: {
  segment: TimedSegment;
  active: boolean;
  visible: boolean;
  mode: PresentationMode;
}): React.ReactElement | null {
  if (!visible) return null;
  return (
    <p
      className={`caption-line caption-line--${segment.speaker} ${active ? 'caption-line--active' : ''} ${mode === 'calm' ? 'caption-line--calm' : ''}`}
    >
      <span className="caption-speaker">{segment.speaker}: </span>
      {segment.text}
    </p>
  );
}

function findActiveSegment(
  dialogue: TimedSegment[],
  currentMs: number
): TimedSegment | null {
  for (const seg of dialogue) {
    if (currentMs >= seg.startMs && currentMs < seg.endMs) {
      return seg;
    }
  }
  return null;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
