# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and learners creating English/Hinglish/Benglish explanations from arbitrary context. The builder wants a reliable hackathon demo with fresh scripts and actual video generation.

## Product Purpose

Brainrotten turns a coding agent's real session into a one-minute learning video. The agent writes the script from its own context through MCP, the Python SDK or the REST API; Studio also accepts a topic. All paths share one voice and video engine. Five formats: sketch board (default for systems and bugs), character skit (concepts), PR review (a real diff), tier list (options weighed) and group chat (parts of a system talking).

## Operating Context

Local BYOK is independent of the hosted Google-authenticated, five-lifetime-video trial, which is live on AWS (S3 + CloudFront website, API Gateway + Lambda in ap-south-1, deployed by GitLab CI). API keys remain server-side or in private local settings. Hosted visitors browse and type freely and sign in only when they generate; the session persists across tabs and renews silently.

## Capabilities and Constraints

13 cloned characters including Oggy/Jack, Badri/Budhdev, Jhaplu/Paplu/Taplu and six Motu Patlu voices. The agent chooses exactly two from context, including cross-show pairs. Stable learner questions alternate with expert answers; connected teaching skits. Studio delegates automatic choice to the configured Gemini/Paper provider and offers manual controls. Only the active character is shown. Videos combine timed captions, small code/image inserts, gameplay, and pitch-preserving faster speech. Up to three minutes. Generated content must be grounded in the source context.

## Brand Commitments

Brainrotten Studio, MCP and a shared asynchronous REST API. Playful cream/lavender/coral/yellow UI, no green accent. User rejected Bochild/Autour and requested unusual independent fonts researched through Reddit. Current pair: Basteleur Bold + Uncut Sans. Minimal functional copy, no slogans or role labels. Do not use the previous invented beginner/expert characters.

## Evidence on Hand

Twelve illustrative example sessions (scripts in scripts/website-examples.py) cover beginner to advanced projects across stacks, every format, in English and Hinglish. The earlier examples from real sessions in this repository are archived in examples/website-archive. Hosted sign-in and generation are live-tested.

## Product Principles

Keep the topic, characters, controls, output, and history clear. Generate only on explicit action. Show actual pipeline progress and safe errors. Preserve context in the invoking agent’s script. Never show a staged clip as a newly generated result.
