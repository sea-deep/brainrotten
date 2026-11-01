---
inclusion: always
---

# Brainrot — Technical steering

## Runtime and tooling

- **Node.js 26** (see `.nvmrc`); MCP configs should point at a stable path such as `/opt/homebrew/bin/node`, never a versioned Cellar path
- **pnpm 9.15.9** workspace; lockfile committed
- **TypeScript 7.0.2** strict mode throughout
- **Zod 4.6.7** for all schema validation
- **Vitest 5.0.5** for tests
- **Vite 8.3.5** + `@vitejs/plugin-react 6.1.2` for the web app
- **MCP v2**: `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/client@2.4.0`
- **SQLite**: `node:sqlite` built-in (stable in Node 26)
- **Express 5.3.0** for the companion HTTP API

## MCP SDK — important

Use `@modelcontextprotocol/server` v2 only. The import path is:
```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
```
Do **not** use `@modelcontextprotocol/sdk` v1 imports. The two are incompatible.

## Workspace layout

```
apps/companion    local HTTP service + MCP stdio bridge
apps/web          React player (Vite)
packages/contracts Zod schemas + inferred types (single source of truth)
packages/core     business logic (transport-independent)
packages/media   shared script, clone speech, B-roll and FFmpeg renderer
cloud/src         JWT-authenticated AWS adapter (not deployed)
infra/sam         SAM template (not deployed)
examples/         fixture repo + example lessons
.kiro/            specs, steering, skills, hooks, settings
docs/             decisions, handoff, feasibility (preserved)
```

## Architectural invariants — never violate

1. **One database owner**: only the companion process opens SQLite. The MCP bridge calls the companion HTTP API.
2. **Contracts are canonical**: `packages/contracts` is the only place wire-format schemas are defined. Never duplicate them.
3. **No secrets in the web bundle**: `apps/web` must not import Node modules, local paths, credentials, or AWS admin code.
4. **Mock is permanent**: a job processed in mock mode keeps `mode: "mock"` forever.
5. **Live generation is explicit**: the user authorized local Paper/ElevenLabs generation on 2026-10-27. Startup, checks and seeds stay offline; explicit UI/MCP generation can use server-side keys.
6. **Cloud is closed**: enable only after Cognito Google, JWT authorization, project secrets and atomic quota are configured. No anonymous paid generation.

## Security rules

- Validate all MCP tool inputs with Zod before any database or filesystem access
- Resolve registered repo paths to canonical absolute paths at registration; re-check on every use
- Reject any citation path that escapes the repo root (PATH_TRAVERSAL)
- Deny `.env`, `*.key`, `*.pem`, `*secret*`, `*credential*`, `*password*` from excerpts
- Companion binds to loopback only; validates Origin/Host on mutation routes
- Session token stored with mode `0o600`; never in access logs or URL query strings

## Testing expectations

- Run `pnpm test` before declaring a task complete
- Tests must be focused and meaningful — no coverage theater
- Use synthetic credentials in fixtures; never real API keys
- MCP integration test uses a real stdio client, not just direct handler calls

## Rendering stack (formats v2)

- FFmpeg composes frames over supplied gameplay; frames are SVG rasterized with `@resvg/resvg-js`.
- Interface panels (WhatsApp, GitHub PR, TierMaker) are laid out with Satori and rendered once per state.
- Sketch boards use `@dagrejs/dagre` for layout and `roughjs` for hand-drawn shapes, with the Virgil font (OFL, shipped as WOFF2 and decompressed at render time).
- Icons: Lucide (generic) and Simple Icons (brands); emoji: Twemoji. All local, nothing fetched while rendering.
- Speech: ElevenLabs cloned voices; Pause & Predict silence inserted with FFmpeg.
