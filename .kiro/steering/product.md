---
inclusion: always
---

# Brainrotten: what Kiro should know

Brainrotten turns what a coding agent just did into a short learning video. The user watches it in Brainrotten Studio now and in the Android app (BrainRotGram) later. One API owns jobs, sessions and learning state; Studio, MCP and Android are clients of it.

## Kiro's two roles

1. **Brainrotten user (the demo).** Through the `brainrotten` MCP server, Kiro explains its own work as a video when the user asks. The server's connection instructions and `get_video_formats` are the source of truth; follow them exactly.
2. **AWS assistant.** Kiro helps deploy the hosted backend (SAM: API Gateway, Lambda worker, SQS, DynamoDB, S3, Cognito with Google, Secrets Manager). See `docs/GOOGLE-AWS-SETUP.md` and `infra/sam/template.yaml`.

## Making a video with the MCP

- Pick the format from what happened: code changed -> `prreview`; parts interacting / bug between systems -> `groupchat`; architecture or data flow -> `sketch`; several options weighed -> `tierlist`; a concept or misconception -> `skit`. `casefile`, `whiteboard` and `pov` are retired.
- Call `get_video_formats` with that format and copy the structure of its `storyExample`. Write the whole script from your real context. Never invent code, test results or metrics.
- Call `validate_video_script`, fix every issue, then `generate_short_video` (or `record_learning_session` + `publish_session_lesson`). It returns a job id immediately; keep working.
- Language: English, Romanized Hinglish or Romanized Benglish (Latin letters only).
- Only generate when the user asks or at a milestone they enabled. It spends speech credits.

## Product rules

- Interface formats (group chat, PR review, sketch, tier list) show no cartoon characters and no captions; voices are audio only. Cartoon characters belong to the skit.
- The agent makes creative choices; Brainrotten draws everything (never send colors, positions, fonts or timings).
- Keep keys server-side. Do not push to GitHub or deploy without the user's instruction.
