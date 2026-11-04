---
inclusion: always
---

# Brainrotten: what Kiro should know

Brainrotten turns what a coding agent just did into a short learning video. The user watches it in Brainrotten Studio now and in the Android app (BrainRotGram) later. One API owns jobs, sessions and learning state; Studio, MCP and Android are clients of it.

## Kiro's two roles

1. **Brainrotten user (the demo).** Through the `brainrotten` MCP server, Kiro explains its own work as a video when the user asks. The server's connection instructions and `get_video_formats` are the source of truth; follow them exactly.
2. **AWS assistant.** Kiro helps deploy and operate the hosted backend (SAM: API Gateway, Lambda worker, SQS, DynamoDB, S3, Cognito with Google, Secrets Manager). The backend is live; deploys run locally (`pnpm deploy:site`, `pnpm deploy:backend`) with the maintainer's AWS login, or in GitLab CI via OIDC.

## The five formats

New videos use one of five formats; `casefile`, `whiteboard` and `pov` are retired — still playable, never creatable.

- **sketch** — default for systems: architecture, data flow, a request path, a bug or a change across components. An Excalidraw-style board builds up, the problem in red and the fix in green.
- **skit** — default for ideas: a concept, a misconception or a decision, as two cartoon characters with connected follow-up questions.
- **prreview** — an explicit review of a real diff, as GitHub-style comments.
- **tierlist** — several options weighed against one criterion, ranked S to F.
- **groupchat** — the parts of a system "talking" in a WhatsApp-style thread.

Any format can **Pause & Predict**: the video stops, asks what happens next, gives a few seconds of silence, then reveals the answer.

## Making a video with the MCP

- Pick the format above. Call `get_video_formats` with it and copy the structure of its `storyExample`. Write the whole script from your real context. Never invent code, test results or metrics.
- Call `validate_video_script`, fix every issue, then `generate_short_video` (or `record_learning_session` + `publish_session_lesson`). It returns a job id immediately; keep working.
- Language: English or Hinglish (Latin letters only).
- Only generate when the user asks or at a milestone they enabled. It spends speech credits.

## Product rules

- Interface formats (group chat, PR review, sketch, tier list) show no cartoon characters and no captions; voices are audio only. Cartoon characters belong to the skit.
- The agent makes creative choices; Brainrotten draws everything (never send colors, positions, fonts or timings).
- Script generation falls back Gemini → Paper in auto mode; speech is ElevenLabs cloned voices. Keep keys server-side.
- Third-party media (character art, voices, gameplay, example videos/posters, `og.png`) never goes in git. It lives in a private bucket; maintainers move it with `pnpm media:pull` / `pnpm media:push` (`scripts/media.mjs`). A test in `scripts/release.test.mjs` and the `scripts/git-hooks/pre-push` hook enforce this — never bypass them.
- Operate the backend read-only with `pnpm ops:status` (queue, outcomes, script-model fallbacks); return a free video on our own errors with `pnpm ops:refund`. Check the Android app against the live API with `pnpm app:sync`.
- GitHub (`sea-deep/brainrotten`) is home; GitLab (`wdipak/brainrotten`, remote `origin`) is the mirror and CI. Do not push, deploy, tag or create releases without the user's instruction.
