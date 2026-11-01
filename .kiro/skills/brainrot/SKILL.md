---
name: brainrot
description: Explain what you just did as a Brainrotten video (PR review, group chat, sketch board, tier list or skit) through the brainrotten MCP server.
---

Use this when the user asks for a video or explanation of the current work.

1. Choose the format. Defaults: systems, flows, bugs or changes -> sketch; concepts or misconceptions -> skit. Otherwise: diff review -> prreview; options weighed -> tierlist; a literal conversation -> groupchat.
2. `get_video_formats` with that format; copy its storyExample structure.
3. Write the complete script from your real context, in the user's language (Latin letters).
4. `validate_video_script`, fix every issue, then `generate_short_video`.

The full guide is [Brainrotten video](../../../.agents/skills/brainrotten-video/SKILL.md).

Faster: if you can run Python, `from brainrotten import Brainrotten; print(Brainrotten(account=True).make_video(request))` does validate + generate + wait in one step (SDK in `sdk/python`).
