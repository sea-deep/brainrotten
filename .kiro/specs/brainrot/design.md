# Design: Brainrotten

Spec revision: 2026-11-01.

## Overview

```
Coding agent (Kiro, Antigravity, Claude Code, Codex, OpenCode, Cursor)
   │  MCP stdio (brainrotten server, playbook sent on connect)
   ▼
Companion API (/api/v1, Express) ── one SQLite owner locally ──┐
   │  queue → engine                                           │
   ▼                                                           │
Media engine: script (agent or Paper/Gemini) → normalize →     │
  validate → ElevenLabs speech → pause silence → frames →      │
  FFmpeg MP4 + learning pack                                   │
                                                               │
Studio (web)  ◄──────────── same API ─────────────► BrainRotGram (Android)
Hosted: API Gateway + Cognito → Lambda API → SQS → Lambda worker → S3 / DynamoDB
```

## Components

| Component | Location | Responsibility |
| --- | --- | --- |
| Contracts | `packages/contracts` | Zod schemas for every wire format; `scriptForFormat` and `normalizeScript` are the single parse path. |
| Media engine | `packages/media` | Script creation with a one-shot repair loop, speech, pause insertion, rendering, learning packs. |
| Companion | `apps/companion` | Local API, job queue, sessions, MCP stdio bridge (calls the API over loopback; never opens SQLite). |
| Studio | `apps/web` | Format picker, topic or agent-script input, library, learning sessions, MCP setup for each editor. |
| Cloud | `cloud`, `infra/sam` | Hosted API and worker with Cognito ownership and quota. |

## Formats and renderers

| Format | Agent supplies | Renderer |
| --- | --- | --- |
| `skit` | two characters, alternating question/answer | character cutouts, karaoke captions, B-roll |
| `groupchat` | group name, 2–4 members (name, icon, voice), messages, reactions, tiny code | `chatFrames.ts`: WhatsApp thread via Satori |
| `prreview` | PR title, author, 1–2 reviewers, real diff lines, anchored comments, verdict | `prFrames.ts`: GitHub dark PR via Satori |
| `sketch` | nodes, edges, per-line show/focus/mark/note | `sketchFrames.ts`: dagre layout, rough.js, Virgil font |
| `tierlist` | criterion, items, one placement per line | `tierFrames.ts`: TierMaker board via Satori |

Interface formats are pre-rendered once per state (one panel per line), then composed per frame as a centered rounded card over gameplay (`panelLayout`). Icons come from Lucide (generic) and Simple Icons (brands); emoji from Twemoji. All assets resolve locally.

## Pause & Predict

`line.pause` on line ≥ 2 (not last). `pauseSeconds` = reading time of question and choices + 3 s, clamped 5–10. `insertPauses` splits the audio with FFmpeg and shifts later segments and words. `preparePauseOverlay` renders countdown and reveal cards for the region under the panel; `PauseOverlay.mode` eases the panel up and back. Each pause becomes learning question `pause-<index>`.

## Agent guidance (for any model)

- `SERVER_INSTRUCTIONS`: format choice, four steps, rules; sent on MCP initialize.
- Per-format rules and complete examples in `formatGuides.ts`, returned by `get_video_formats`.
- `normalizeScript` fixes mechanical mistakes; `validate_video_script` reports them as warnings.
- `createInterfaceScript` states the requested language and repairs once with exact issues.

## Data and security

- Contracts are canonical; breaking changes need a new schema version. All new fields are additive.
- Local: private token for MCP, owner session for Studio; learner-only writes for session reflections.
- Hosted: Cognito access tokens, subject-scoped DynamoDB rows, atomic five-video lifetime quota, signed S3 media.

## Testing

- `pnpm check`: build, strict typecheck, lint, Vitest (contracts, media incl. real offline MP4s per format, companion incl. real MCP stdio, web, cloud) and release tests.
- `pnpm verify:e2e`: real MCP → HTTP queue → render → downloads → reviews for every creatable format with synthetic providers; zero paid calls.
