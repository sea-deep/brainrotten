---
inclusion: always
---

# Brainrot — Structure and conventions

## File naming

- TypeScript source: `camelCase.ts` for modules, `PascalCase.tsx` for React components
- Test files: co-located `*.test.ts` / `*.test.tsx`
- Schema files: `*Schema.ts` in `packages/contracts/src/`
- No barrel `index.ts` re-exports that hide the real module location

## Import discipline

- Use explicit relative imports within a package
- Cross-package imports use the workspace package name (`@brainrot/contracts`, `@brainrot/core`)
- No circular dependencies between packages
- `apps/web` must only import from `@brainrot/contracts` types (not `@brainrot/core` or Node built-ins)

## Error handling

- All errors returned to external callers use `StructuredError` from `@brainrot/contracts`
- Safe messages only — no stack traces, credentials, or absolute paths to callers
- Internal errors are logged to stderr with a correlation ID

## Logging

- Companion: structured JSON to stderr using a simple logger
- MCP bridge: `stderr` only; `stdout` is reserved for the MCP protocol wire
- Web app: `console.error` only; no verbose logging in production builds
- Cloud handlers: structured CloudWatch metadata; no prompts or code content in logs

## Environment variables

```
BRAINROT_DATA_DIR    override for local data directory (default: ~/.local/share/brainrot)
BRAINROT_PORT        companion HTTP port (default: 3001)
BRAINROT_LOG_LEVEL   error|warn|info|debug (default: info)
```

Never commit `.env` files. The test suite uses synthetic values.

## Code style

- ESLint with TypeScript plugin; no `any` without an explicit comment
- Prefer `const` and functional patterns
- Async/await over raw Promises
- No `process.exit()` inside library code (only in CLI entry points)

## Git conventions

- Commit messages: `type(scope): description` (conventional commits)
- Never commit: `.env`, `*.key`, `*.pem`, `data/` directory contents, `node_modules/`
- The `pnpm-lock.yaml` lockfile is committed

## Adding a new MCP tool

1. Define input/output Zod schemas in `packages/contracts/src/mcpSchemas.ts`
2. Implement the handler in `packages/core`
3. Add the HTTP route in `apps/companion/src/http/routes.ts`
4. Register the tool in `apps/companion/src/mcp/server.ts`
5. Update the skill instructions in `.kiro/skills/brainrot/SKILL.md`
6. Add focused tests

## Where formats live

- Schemas and the single parse path: `packages/contracts/src/videoSchema.ts` (`scriptForFormat`, `normalizeScript`).
- Per-format rules and complete examples for agents: `packages/media/src/formatGuides.ts`.
- Renderers: `chatFrames.ts`, `prFrames.ts`, `sketchFrames.ts`, `tierFrames.ts`, shared `uiKit.ts`, pauses in `pause.ts`.
- New format checklist: contract + normalize rules, renderer, rules and example, MCP guide branch, Studio picker, routing in `sessionLearning.ts`, tests including a real offline MP4, and the e2e script.
