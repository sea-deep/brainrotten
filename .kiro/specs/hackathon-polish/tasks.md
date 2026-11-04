# Tasks: Hackathon polish

Spec revision: 2026-11-04. Each task maps to a requirement in `requirements.md`. Tasks are
executed one by one and ticked here as they complete. Hard rules apply throughout: no
third-party media staged, no GitHub Releases/tags, no paid calls except T-5, never bypass the
media guard or pre-push hook, never push.

- [x] 1. Refresh steering from the code (Req 2)
  - [x] 1.1 `product.md`: five formats + Pause & Predict, English/Hinglish, Gemini→Paper,
        media out of git, local deploys, ops:status, app:sync, GitHub home / GitLab mirror
  - [x] 1.2 `tech.md`: add the script-model chain (Gemini→Paper); drop stale "(not deployed)"
        notes; add media-guard + pre-push, deploy/ops/app commands
  - [x] 1.3 `structure.md`: add the real scripts (media, deploy-local, ops-status, ops-refund,
        app-sync) and the remotes; confirm no contradictions remain

- [x] 2. Update existing specs with honest status (Req 3)
  - [x] 2.1 `.kiro/specs/brainrot/tasks.md`: "Since this spec" note (GitLab mirror, media
        bucket, per-job telemetry, refunds on our own errors); do not invent completions
  - [x] 2.2 `.kiro/specs/hosted-deploy/tasks.md`: "Since this spec" note; mark what is known
        done vs. unverified without silently re-ticking per-task AWS evidence

- [x] 3. Harden the opt-in hook (Req 4)
  - [x] 3.1 Keep it disabled; keep the explicit opt-in / ask-before-credits gate; document
        non-recursion and companion-unreachable skip in the notes

- [x] 4. Write HACKATHON.md (Req 1, 4.4)
  - [x] 4.1 What it is (2 lines), Built with Kiro (links to real .kiro files), 2-minute demo,
        how to enable the hook + credit warning, and a "Made by Kiro" placeholder

- [x] 5. Closing video — "watermark" (Req 5)
  - [x] 5.1 `get_video_formats("sketch")`, write the script from this pass's real changes,
        `validate_video_script`, `generate_short_video`; job 2c243237-5650-482f-8447-ee4fa1e8ed01
        recorded in HACKATHON.md under "Made by Kiro"

- [x] 6. Verify (Req 6)
  - [x] 6.1 `pnpm check` passed (cloud 34, companion 106, Python 5; media-guard test green);
        no third-party media staged; diff summary reported; not pushed
