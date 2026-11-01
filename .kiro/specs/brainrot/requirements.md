# Requirements: Brainrotten

Spec revision: 2026-11-01. Replaces the 27 October scaffold spec (lesson drafts) with the current product.

## Introduction

Brainrotten turns what a coding agent just did into a short learning video, so a developer who vibe-codes understands the change instead of doomscrolling. Any MCP-capable agent (Kiro, Antigravity, Claude Code, Codex, OpenCode, Cursor) sends its real session context; Brainrotten picks voices, draws the video, and stores learning state in the user's account. Studio (web) and the BrainRotGram Android app are clients of one API.

## Requirement 1: One API, many clients

**User story:** As a developer, I want Studio, MCP and the Android app to share one backend, so my videos, sessions and answers are the same everywhere.

1. WHEN any client creates, reads or reviews a video THE SYSTEM SHALL use the `/api/v1` routes and the schemas in `packages/contracts`.
2. WHEN running locally THE SYSTEM SHALL bind to loopback and authorize with the installation's private token; WHEN hosted it SHALL accept only Cognito access tokens and scope all data to the token subject.
3. THE SYSTEM SHALL publish the contract as OpenAPI (1.3) for the Android client.

## Requirement 2: Agent-chosen formats

**User story:** As a coding agent, I want to pick the format that fits what happened, so the explanation matches the change.

1. THE SYSTEM SHALL offer `skit`, `groupchat`, `prreview`, `sketch` and `tierlist` for new videos, and keep `casefile`, `whiteboard` and `pov` readable but not creatable.
2. WHEN an agent connects over MCP THE SYSTEM SHALL send a playbook that maps situations to formats (code changed → prreview, parts interacting → groupchat, architecture → sketch, options weighed → tierlist, concept → skit).
3. WHEN an agent calls `get_video_formats` with a format THE SYSTEM SHALL return its rules and a complete valid example.
4. WHEN a learning session is recorded THE SYSTEM SHALL recommend a format with a reason, and the agent MAY override it with its own rationale.

## Requirement 3: AI makes creative choices, the app draws

**User story:** As the builder, I want the agent to decide content and the app to decide visuals, so every video looks authentic and never sloppy.

1. THE SYSTEM SHALL accept only content from agents (cast, lines, diff lines, nodes, items, reactions, notes) and SHALL reject layout, color, font or timing input.
2. Interface formats SHALL copy interfaces people recognize: a WhatsApp group, a GitHub pull request, an Excalidraw board, a TierMaker board.
3. Interface formats SHALL show no cartoon characters and no captions; cloned voices are audio only. Cartoon characters belong to the skit.
4. THE SYSTEM SHALL center interface panels over the supplied gameplay.

## Requirement 4: Works with small models

**User story:** As a user of a fast, cheap model, I want valid videos anyway.

1. WHEN a script has mechanical mistakes (out-of-range lines, pasted diff signs, duplicate edges, early pauses, emoji in spoken text) THE SYSTEM SHALL fix them and report each fix as a validation warning.
2. WHEN a generated script fails validation THE SYSTEM SHALL send the exact issues back to the model once and accept a corrected script.
3. THE SYSTEM SHALL validate before any paid speech call; failed validation SHALL never bill speech.

## Requirement 5: Learning, not just watching

**User story:** As a learner, I want to think before the answer, so I actually understand.

1. WHEN a line has a Pause & Predict THE SYSTEM SHALL insert real thinking time sized to the question's reading length (5–10 s) and keep the content visible.
2. THE SYSTEM SHALL reject pauses on the first two lines and on the last line.
3. THE SYSTEM SHALL turn each pause into a graded learning-pack question linked to the reveal line.
4. THE SYSTEM SHALL store predictions, practice and reflections per session; only the learner may write them, never the agent.

## Requirement 6: Explicit, safe generation

1. THE SYSTEM SHALL generate only on an explicit request; startup, tests and validation SHALL make no paid calls.
2. THE SYSTEM SHALL keep provider keys server-side and never return them to clients.
3. Hosted generation SHALL require a Cognito-authenticated user and an atomic lifetime quota reservation.

## Requirement 7: Android-ready (BrainRotGram)

1. THE SYSTEM SHALL let a native Cognito app client (via `AdditionalClientIds`) call the hosted API.
2. THE SYSTEM SHALL expose sessions, videos, library, reviews and learning packs with stable, versioned schemas.
