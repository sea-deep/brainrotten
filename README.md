# Brainrotten

Brainrotten turns agent context or a topic into a short explanation: a two-character skit, a WhatsApp-style group chat where the components (with real icons) text each other, a GitHub-style PR review of the real diff, an Excalidraw-style sketch board, or a TierMaker-style tier list. Any format can pause for a Pause & Predict question. Studio, MCP and the REST API share the same generation pipeline, cloned voices, reference inserts and portable learning packs.

## Requirements

- Node.js 26+
- pnpm 9+
- FFmpeg and ffprobe installed and available in your `PATH`

## Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Add your API keys (e.g. `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`) if generating live voice or AI scripts.

3. **Build the packages:**
   ```bash
   pnpm build
   ```

4. **Start the local app:**
   ```bash
   pnpm dev
   ```
   The Studio web UI will be accessible at `http://127.0.0.1:3001/studio`.

## Available Scripts

- `pnpm dev`: Starts both the companion server and the Studio web interface with hot-reloading.
- `pnpm build`: Builds all monorepo packages and applications.
- `pnpm test`: Runs the test suite across packages.
- `pnpm typecheck`: Type-checks TypeScript across all packages.
- `pnpm lint`: Runs ESLint across all projects.
- `pnpm check`: Runs build, typecheck, lint, and tests.
- `pnpm verify:e2e`: Builds and verifies the real local MCP/HTTP queue through MP4 rendering, downloads and saved reviews for every current format, with synthetic provider responses and temporary data. No API credits are used. FFmpeg and ffprobe are required. After a build, `node scripts/verify-generation-e2e.mjs --serve` keeps that isolated app open for browser QA; Ctrl+C removes its temporary data.
- `pnpm mcp`: Starts the MCP stdio server bridge.


## Learning sessions

An agent can save what it changed and why as a learning **session**, then publish a lesson for it. The learner predicts (or skips), watches, answers, practises a small transfer task and reflects in Studio under "Learn from your agent". MCP tools: `get_learning_guide`, `record_learning_session`, `list_learning_sessions`, `get_learning_session`, `publish_session_lesson`. Learner responses can only be written by the learner, never by the agent token. For a hosted account, run `pnpm brainrotten login --api-url …` once and start MCP with `--account`. [Session API](docs/CLIENT-INTEGRATION.md#learning-sessions-openapi-13) · [Account connection](docs/MCP-SETUP.md#hosted-account-connection-recommended).

## Video formats and learning packs

Choose `skit`, `casefile`, `whiteboard` or `pov` in Studio. MCP clients call `get_video_formats` for each format’s contract and `list_video_voices` for actual readiness. Complete agent-written scripts bypass the script model; optional quizzes are supplied in that same script. Topic generation can request 0–3 review questions without a separate model call.

New completed videos include chapters, a quiz with replay links when requested, a transcript, `learning.json`, `notes.md` and `captions.srt`. Studio saves watch position, bookmarks and graded answers through the shared API. Local state belongs to this installation; hosted state belongs to the authenticated account. Studio can import complete agent requests and check scripts without a model or speech call. Saved V2 videos remain playable. [Format and API contract](docs/VIDEO-FORMATS.md) · [MCP setup](docs/MCP-SETUP.md).


The shared API now includes `/library`, `/videos/validate` and `/videos/{jobId}/review`. MCP adds `list_videos`, `validate_video_script` and `get_video_review`. Study packs include flashcards; CSV, MP3, SRT, JSON and Markdown outputs are available without another inference request. [Client integration and review contract](docs/CLIENT-INTEGRATION.md).

## Credits

Group chat emoji use [Twemoji](https://github.com/jdecked/twemoji) graphics by Twitter, Inc. and contributors, licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/), via the MIT-licensed `@twemoji/svg` package. Sketch boards use the [Virgil](https://github.com/excalidraw/virgil) font (OFL-1.1, Ellinor Rapp), [rough.js](https://github.com/rough-stuff/rough) (MIT) and [dagre](https://github.com/dagrejs/dagre) (MIT). Member icons come from [Lucide](https://lucide.dev) (ISC) and [Simple Icons](https://simpleicons.org) (CC0; brand logos remain their owners' trademarks). Chat panels are laid out with [Satori](https://github.com/vercel/satori) (MPL-2.0).
