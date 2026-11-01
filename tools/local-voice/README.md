# Maya local voice backend

Normal Studio and its tests never install packages, download models, or generate speech automatically. Explicit generation uses short prepared character references, their matching transcripts, the **full-precision BF16 Maya 2 Native model**, and `icl_spk` conditioning. Word/phrase timing uses local Whisper cross-attention/DTW on the exact Latin script. There is no transliteration or automatic paid fallback.

## Setup

This backend requires Apple Silicon macOS, Python 3.11 through uv, and FFmpeg. Studio/MCP still run with ElevenLabs on other platforms. After `pnpm install` and `pnpm build`:

```sh
pnpm voices:local
```

This creates an isolated environment under `~/.local/share/brainrotten-voice`, installs the pinned requirements, downloads the pinned checkpoint and codec/encoder/alignment dependencies, prepares references, and performs explicit technical speech/alignment checks. The model alone downloads roughly 5 GB; additional dependencies and runtime memory are required. The source weights are cached/hard-linked where possible. Correct voice likeness still requires listening evaluation.

Reference transcription is local by default. The builder’s CSV metadata contains incorrect translations and is **not** used as a transcript. To explicitly use the configured ElevenLabs Scribe API for changed references instead:

```sh
pnpm voices:local --scribe
```

Scribe calls occur only in that explicit setup command and consume the account’s transcription allowance. Ongoing Maya generation uses the prepared private references and makes no provider speech/transcription calls. The current 13 references were prepared this way, with Hindi detected in every selected source. Jack uses the older root recording, matching the user’s preference; Patlu uses a normal-voice clip rather than the Inspector Patlu sequence.

Select **Maya 2 · local** in Studio Settings. ElevenLabs stays selectable and remains the default. An MCP request can set `voiceBackend: "maya-local"` or `"elevenlabs"`; jobs snapshot that choice. Local reference hashes invalidate readiness/cache when recordings change. Refresh references after changing a selected source:

```sh
node scripts/prepare-local-references.mjs --scribe
```

`BRAINROTTEN_LOCAL_VOICE_DIR` can override the private installation directory. Do not put models, prepared references, private transcripts, keys, or generated speech into the web bundle. The AWS hosted adapter intentionally rejects the Mac-only backend.

## What the checks established

On the builder’s M5/16 GB Mac, full-precision ICL probes retained the requested English, Romanized Hinglish and Romanized Benglish content in independent Scribe checks. A full MCP request generated a 24.30-second Motu/Patlu MP4 with a follow-up question, Shiki code B-roll, local caption alignment and supplied Minecraft footage. Peak model memory in the measured BF16 probes was about 6.3 GB.

The 4-bit model and speaker-only conditioning produced substantial content errors. They are not the production configuration. The readiness marker requires BF16/ICL. Maya uses the prepared reference’s delivery; ElevenLabs-specific acting controls are not applied to Maya.

The isolated Python environment is pinned in requirements.lock; source revision is pinned in the Node adapter/setup.py. Model/component license references are in docs/VOICE-ENGINE-RESEARCH.md. Maya/Qwen/ECAPA use Apache-2.0; Mimi retains CC-BY-4.0 attribution. MLX-Audio retains its MIT license.

## Maya → ElevenLabs candidate experiment

An explicit command extracts **one speaker only** from a completed Maya generation, restores its original pace and creates a separate account-specific instant clone:

```sh
node scripts/clone-maya-candidate.mjs <Maya-job-uuid> patlu
```

It rejects samples under ten seconds, does not repeat/pad them, never overwrites the original clone registry, and does not activate the candidate. A 17.51-second Patlu candidate was created successfully from the validated Maya example. It is listed by `list_video_voices` for explicit MCP selection through `voiceIds`; original voices remain the default. This is a reference-conditioned clone experiment, not new model-weight training or a demonstrated likeness improvement.
