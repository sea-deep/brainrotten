# Requirements: Hackathon polish

Spec revision: 2026-11-04. A final documentation-and-safety pass before the hackathon
submission. No product behavior changes: this pass adds a judges' guide, truthful steering
and spec status, and a safe opt-in hook. It must not commit third-party media, create
GitHub Releases/tags, or make paid provider calls (except the one closing video).

## Introduction

Brainrotten turns what a coding agent just did into a short learning video. The code, the
hosted backend and five video formats already exist and ship. This spec covers the final
polish: a `HACKATHON.md` for judges, steering files refreshed from the code as it stands
today, honest status in the existing specs, and a deliberately disabled "explain my last
task" hook. Every requirement is written so a reviewer can check it against the repository.

## Requirement 1: Judges' guide (HACKATHON.md)

**User story:** As a hackathon judge, I want one page that explains what Brainrotten is and
how it was built with Kiro, so I can evaluate it quickly and follow a short live demo.

1. THE SYSTEM SHALL include a `HACKATHON.md` at the repository root.
2. HACKATHON.md SHALL describe what Brainrotten is in two lines.
3. HACKATHON.md SHALL explain how the project was built with Kiro and SHALL link the real
   files under `.kiro/` for specs, steering, skills, hooks and the MCP settings.
4. HACKATHON.md SHALL contain a two-minute demo script a presenter can follow.
5. HACKATHON.md SHALL document how to turn the opt-in task-complete hook on, and the
   credit-cost warning that applies when it is on.
6. HACKATHON.md SHALL end with a "Made by Kiro" section holding the closing video's job ID
   and a one-line summary.

## Requirement 2: Steering matches the code

**User story:** As a contributor or agent, I want the steering files to describe the project
as it actually is today, so I do not act on stale guidance.

1. THE steering SHALL list exactly the five creatable formats (`sketch`, `skit`, `prreview`,
   `tierlist`, `groupchat`) and SHALL describe Pause & Predict.
2. THE steering SHALL state the supported languages as English and Hinglish (Latin letters).
3. THE steering SHALL describe script generation as Gemini first with a fallback to Paper in
   auto mode, matching `packages/media/src/scriptProviders.ts`.
4. THE steering SHALL state that third-party media is kept out of git and moved with
   `scripts/media.mjs` (`pnpm media:pull` / `pnpm media:push`).
5. THE steering SHALL describe deploys as local commands (`pnpm deploy:site`,
   `pnpm deploy:backend`), the health check (`pnpm ops:status`) and the app integration
   check (`pnpm app:sync`).
6. THE steering SHALL state that GitHub is the home remote and GitLab is a mirror.
7. THE steering SHALL NOT contain claims that contradict the current scripts, package.json
   or source (for example a wrong provider order or a retired format presented as creatable).

## Requirement 3: Existing specs tell the truth

**User story:** As a reviewer, I want the existing task lists to reflect what actually
happened, so progress is honest.

1. THE SYSTEM SHALL mark in `.kiro/specs/brainrot/tasks.md` and
   `.kiro/specs/hosted-deploy/tasks.md` the tasks that are actually done.
2. THE SYSTEM SHALL add short notes for what changed since those specs were written:
   the GitLab mirror, the private media bucket, per-job telemetry, and refunds on our own
   errors.
3. THE SYSTEM SHALL NOT invent tasks or completions that did not happen.

## Requirement 4: Safe, opt-in task-complete hook

**User story:** As a developer, I want an optional hook that can explain my last task as a
video, without it ever surprising me with a cost or looping on itself.

1. THE hook `.kiro/hooks/brainrot-task-complete.json` SHALL be disabled by default.
2. THE hook SHALL only generate a video after an explicit opt-in signal, because generation
   spends speech credits.
3. THE hook SHALL NOT be able to trigger itself in a loop.
4. THE hook's enable procedure SHALL be documented in HACKATHON.md.

## Requirement 5: Closing video ("watermark")

**User story:** As the team, I want Kiro to explain its own work in this pass as one
Brainrotten video, as a signature on the submission.

1. THE SYSTEM SHALL produce exactly one `sketch` video, in English, through the Brainrotten
   MCP server, following the skill: `get_video_formats` → write the script from the real
   changes → `validate_video_script` → `generate_short_video`.
2. THE script SHALL describe only changes actually made in this pass; it SHALL NOT invent
   code, test results or metrics.
3. THE resulting job ID and a one-line summary SHALL be recorded in HACKATHON.md.

## Requirement 6: Guardrails hold

**User story:** As the maintainer, I want the pass to respect the repo's hard rules, so
nothing unsafe is committed.

1. THE pass SHALL NOT stage or commit third-party media (anything under `assets/characters`,
   `assets/gameplay`, example videos/posters, `og.png`, or any `.mp4`/`.mp3`/`.wav`).
2. THE pass SHALL NOT create GitHub Releases, tags, or GitHub Packages.
3. THE pass SHALL NOT bypass the media-guard test or the pre-push hook.
4. THE pass SHALL run `pnpm check` and report its result before anything is called done.
5. THE pass SHALL NOT push; the user reviews and pushes.
