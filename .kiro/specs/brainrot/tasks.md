# Implementation plan: Brainrotten

Spec revision: 2026-11-01. Requirement numbers refer to `requirements.md`.

- [x] 1. Shared contracts and one API for Studio, MCP and future clients (Req 1)
  - [x] 1.1 Video, session, review and library schemas in `packages/contracts`; OpenAPI 1.3
  - [x] 1.2 Local loopback auth with private MCP token; hosted Cognito subject scoping
- [x] 2. Learning sessions with predictions, practice and reflections, learner-only writes (Req 5.4)
- [x] 3. Group chat format: WhatsApp thread, icon members, voices only (Req 2, 3)
- [x] 4. PR review format: GitHub-style diff, anchored comments, verdict (Req 2, 3)
- [x] 5. Pause & Predict on any format: reading-time silence, panel slides up, graded question (Req 5.1–5.3)
- [x] 6. Retire casefile, whiteboard and pov from creation; keep them playable (Req 2.1)
- [x] 7. Sketch board format: Excalidraw look with dagre and rough.js (Req 2, 3)
- [x] 8. Tier list format: TierMaker board, criterion always shown (Req 2, 3)
- [x] 9. Center interface panels over gameplay (Req 3.4)
- [x] 10. Small-model readiness (Req 4)
  - [x] 10.1 `normalizeScript` auto-fixes, reported as warnings
  - [x] 10.2 One-shot repair loop with exact validation issues
  - [x] 10.3 Requested language stated in every interface prompt; non-Latin scripts rejected
  - [x] 10.4 MCP connection playbook (`SERVER_INSTRUCTIONS`)
- [x] 11. Editor setup: Kiro, Antigravity, Claude Code, Codex, OpenCode, Cursor; upgrade-proof Node path (Req 1)
- [x] 12. Verification: `pnpm check` and `pnpm verify:e2e` for every creatable format (Req 6.1)
- [ ] 13. Deploy the hosted backend with SAM (Req 6.3, 7)
  - [ ] 13.1 Cognito user pool with Google, web and agent app clients
  - [ ] 13.2 Provider secret in Secrets Manager; enable the hosted trial
  - [ ] 13.3 Live test: Google sign-in, quota reservation, one hosted video
- [ ] 14. BrainRotGram Android app against the hosted API (Req 7)
  - [ ] 14.1 Native Cognito app client via `AdditionalClientIds`
  - [ ] 14.2 Sessions, library, player, predictions and reflections
- [ ] 15. Demo: an agent explains its own change in each format, recorded end to end
