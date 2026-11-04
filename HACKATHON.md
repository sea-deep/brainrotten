# Brainrotten — hackathon guide

## What it is

AI coding agents change your code faster than you can read it. Brainrotten turns what your
agent just did into a one-minute video you would actually watch — a hand-drawn diagram, a
code review, a ranking, two characters arguing it out, or the parts of your system texting
each other — that pauses to ask what happens next and ends with a short quiz.

## Built with Kiro

Brainrotten is built spec-first with Kiro: specs, steering, a skill, an agent hook and an MCP
server. The real artifacts:

| Kiro feature | Where it lives | What it does |
|---|---|---|
| Specs | [`.kiro/specs/brainrot/`](.kiro/specs/brainrot/) · [`.kiro/specs/hosted-deploy/`](.kiro/specs/hosted-deploy/) · [`.kiro/specs/hackathon-polish/`](.kiro/specs/hackathon-polish/) | EARS-style requirements → design → tasks for the product, the hosted deploy, and this final polish pass |
| Steering | [`product.md`](.kiro/steering/product.md) · [`tech.md`](.kiro/steering/tech.md) · [`structure.md`](.kiro/steering/structure.md) | Always-on context: the five formats, the stack and invariants, and the file/script conventions |
| Skill | [`.kiro/skills/brainrot/SKILL.md`](.kiro/skills/brainrot/SKILL.md) | How Kiro explains its own work as a Brainrotten video |
| Hook | [`.kiro/hooks/brainrot-task-complete.json`](.kiro/hooks/brainrot-task-complete.json) | Optional, disabled-by-default "explain my last task" hook |
| MCP | [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json) | The `brainrotten` MCP server Kiro calls to make videos |

Under the hood: one `/api/v1` backend shared by Studio, the MCP server and the Android app;
Zod contracts in `packages/contracts`; rendering in `packages/media` (Satori + resvg frames,
rough.js sketches, FFmpeg composition); script text from Gemini with a fallback to Paper;
speech from ElevenLabs cloned voices. The hosted backend runs on AWS (API Gateway, Lambda,
SQS, DynamoDB, S3, Cognito with Google) and is deployed with SAM.

## Two-minute demo

The Android companion is a team contribution maintained separately: **[brainrotgram, our teammate's repository](https://github.com/bhumikasudarshani-cmd/brainrotgram)**. [Signed Android releases](https://github.com/bhumikasudarshani-cmd/brainrotgram/releases/latest) use the same account/API as this backend. The repository boundary preserves the teammate's ownership; Kiro workflow evidence should describe the specific work performed in each repository rather than imply it authored the entire Android app.

1. **The problem (15s).** "Your agent just refactored three files. Do you actually understand
   what changed?" Open the [examples page](https://d3sk6lwsh4ufyv.cloudfront.net/examples).
2. **Make one (45s).** In your agent, say: *"Explain what we just did as a Brainrotten video."*
   The agent picks a format, writes the script from the real change, validates it, and kicks
   off generation — then keeps working. Show that it returned a job id immediately.
3. **Watch it (40s).** Play a ready video: the sketch board builds up, the problem in red and
   the fix in green; it **pauses to ask** what happens next; it ends with a quick quiz.
4. **The range (15s).** Flip through the five formats — sketch, skit, PR review, tier list,
   group chat — and mention English and Hinglish.
5. **It's real (5s).** `pnpm check` is green; the hosted site is live; the installer is one
   command: `npx -y brainrotten-mcp@latest setup`.

## Turn on the task-complete hook

The hook at [`.kiro/hooks/brainrot-task-complete.json`](.kiro/hooks/brainrot-task-complete.json)
can offer to explain each finished spec task as a video. It is **disabled by default** and is
built not to surprise you:

1. Remove the `"_disabled": true` line from the hook file to enable it.
2. Opt in per session by setting `BRAINROT_AUTO_LESSON=true` (or just ask for a video in the
   task). Without that, the hook does nothing.
3. **It costs credits.** Generating a video spends speech credits, so the hook always asks for
   confirmation before it calls `generate_short_video`, and the workspace MCP settings auto-approve
   only the free, read-only Brainrotten tools: generating, recording or publishing always asks you.

It cannot loop on itself: it fires on `PostTaskExec` (a task status change), while making a
video is MCP tool calls, which never change a task's status. If the Brainrotten companion is
not running, the hook skips silently and never blocks your coding.

## Made by Kiro

Kiro signed off this pass by explaining it in its own product: a **sketch** video (English)
that walks through grounding the docs in the code — refreshing steering from the real scripts,
telling the truth in the specs, and keeping the credit-spending hook disabled and opt-in.

- **Job ID:** `2c243237-5650-482f-8447-ee4fa1e8ed01`
- **Format:** sketch · **Language:** English · generated through the `brainrotten` MCP server
