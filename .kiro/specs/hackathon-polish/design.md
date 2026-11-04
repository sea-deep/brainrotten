# Design: Hackathon polish

Spec revision: 2026-11-04. Maps each requirement in `requirements.md` to a concrete change.
This is a documentation-and-safety pass: it edits Markdown, one hook JSON, and produces one
video. It changes no product code and adds no dependencies.

## Guiding constraints

- Ground every statement in the current repository, not memory. The source of truth is:
  `package.json` scripts, `scripts/media.mjs`, `scripts/deploy-local.sh`,
  `scripts/ops-status.mjs`, `scripts/ops-refund.mjs`, `scripts/app-sync.mjs`,
  `packages/media/src/scriptProviders.ts`, `scripts/release.test.mjs` (the media guard),
  `scripts/git-hooks/pre-push`, and the existing specs.
- Keep every change small and reviewable. Prefer additive edits; do not rewrite files that
  are already correct.
- Respect the hard rules: no third-party media staged, no GitHub Releases/tags, no paid calls
  except the one closing video, never bypass the media guard or pre-push hook, never push.

## 1. HACKATHON.md (Req 1)

A new root file with four short sections:

1. **What it is** — two lines, drawn from `README.md`.
2. **Built with Kiro** — a short table linking the real artifacts:
   - Specs: `.kiro/specs/brainrot/`, `.kiro/specs/hosted-deploy/`, `.kiro/specs/hackathon-polish/`
   - Steering: `.kiro/steering/product.md`, `tech.md`, `structure.md`
   - Skill: `.kiro/skills/brainrot/SKILL.md`
   - Hook: `.kiro/hooks/brainrot-task-complete.json`
   - MCP: `.kiro/settings/mcp.json`
3. **Two-minute demo** — numbered beats a presenter can read aloud.
4. **Turn on the task-complete hook** — the enable steps and the credit warning (Req 4.4).
5. **Made by Kiro** — a placeholder filled in after the closing video returns a job ID (Req 1.6, 5.3).

## 2. Steering refresh (Req 2)

Edit the three steering files to match today's code. Specific corrections verified against
source:

- **Formats:** five creatable — `sketch`, `skit`, `prreview`, `tierlist`, `groupchat`;
  `casefile`/`whiteboard`/`pov` retired (playable, not creatable). Describe Pause & Predict.
- **Languages:** product steering already says "English, Romanized Hinglish or Romanized
  Benglish". The user's instruction for this pass is English and Hinglish; align the user-
  facing wording to English/Hinglish while leaving the code's actual language support intact.
- **Script providers:** `SCRIPT_PROVIDERS = [geminiProvider, paperProvider]`; auto tries
  Gemini, falls back to Paper; an explicit choice never falls back. The current `tech.md`
  Rendering section mentions ElevenLabs voices but not the script-model chain — add it.
- **Media out of git:** `scripts/media.mjs pull|push`, bucket from stack `brainrotten-ci`
  output `MediaBucketName`; the guard is a test in `scripts/release.test.mjs` plus the
  `scripts/git-hooks/pre-push` hook (installed with `git config core.hooksPath scripts/git-hooks`).
- **Deploys local:** `pnpm deploy:site` and `pnpm deploy:backend` run `scripts/deploy-local.sh`;
  same steps optionally run in GitLab CI via OIDC.
- **Health / app checks:** `pnpm ops:status` (read-only backend health, queue, outcomes,
  script-model fallbacks), `pnpm ops:refund` (return the free video on our own errors),
  `pnpm app:sync` (read-only BrainRotGram clone checked against the live API).
- **Remotes:** GitHub (`sea-deep/brainrotten`) is home; GitLab (`wdipak/brainrotten`) is the
  mirror and the CI remote (`origin`).

The old `tech.md` "not deployed" notes on cloud/SAM are stale (the backend is deployed) — the
honest status lives in the specs; keep tech.md focused on tooling and invariants and drop the
inaccurate "(not deployed)" annotations.

## 3. Existing spec status (Req 3)

- `.kiro/specs/brainrot/tasks.md`: the list already reflects most completions. Add a short
  "Since this spec" note capturing the GitLab mirror move, the private media bucket, per-job
  telemetry (`pnpm ops:status`), and refunds on our own errors (`pnpm ops:refund`). Do not
  tick 14.2 or 15 (BrainRotGram screens and the full multi-format demo are not done).
- `.kiro/specs/hosted-deploy/tasks.md`: Phase 0 and Phase 1 are already ticked. The hosted
  backend is live (see `brainrot/tasks.md` 13.3), so the deploy phases happened. Add a short
  "Since this spec" note rather than silently re-ticking phase-by-phase AWS steps whose exact
  per-task evidence is not in the repo; be explicit about what is known done vs. unverified.

## 4. Hook safety (Req 4)

The current hook is already disabled (`_disabled: true`) and gated on `BRAINROT_AUTO_LESSON`.
Strengthen it:

- Keep `_disabled: true`.
- Keep the explicit opt-in gate (generation only when `BRAINROT_AUTO_LESSON=true` or the task
  explicitly asks), and make the "ask before spending credits" intent explicit in the prompt.
- Loop safety: the hook triggers on `PostTaskExec`. Generating a video is MCP tool calls, not
  a spec-task status change, so it cannot re-fire `PostTaskExec` on itself. State this
  non-recursion explicitly in the notes so it stays true, and instruct the hook to skip if the
  companion is unreachable (never block coding).

## 5. Closing video (Req 5)

Use the `brainrotten` MCP server from `.kiro/settings/mcp.json` and the skill:
`get_video_formats("sketch")` → copy the storyExample structure → write the script from this
pass's real changes → `validate_video_script` → `generate_short_video`. One video, English,
sketch. Record the returned job ID in HACKATHON.md.

## 6. Verification (Req 6)

- `pnpm check` runs build + typecheck + lint + tests (TS and Python), including the media
  guard test. Run it at the end and report the result.
- Confirm `git status` shows no third-party media staged.
- Do not push.

## Testing strategy

No new automated tests — this pass changes docs and one hook JSON, not product code. The
existing `pnpm check` (notably the media-guard test in `scripts/release.test.mjs`) is the gate.
Manual verification: links in HACKATHON.md resolve to real files; steering claims cross-checked
against the cited source files.
