# Brainrotten Python SDK

The Brainrotten MCP tools as plain Python functions. An agent writes one short script instead of several tool calls, and prints only a small summary, so it spends far fewer tokens. Standard library only.

```sh
pip install /path/to/brainrotten/sdk/python
```

```python
from brainrotten import Brainrotten

br = Brainrotten()                 # local Studio (127.0.0.1:3001, private token found automatically)
# br = Brainrotten(account=True)   # hosted account saved by `pnpm brainrotten login --api-url ...`

guide = br.format_guide("sketch", language="hinglish")   # rules + a complete valid example
request = guide["storyExample"]                          # start from the example, write your own content
request["script"]["title"] = "Why the cache served an old price"
print(br.make_video(request, download_to="lesson.mp4"))  # validate + generate + wait, small summary
```

Defaults: `sketch` for systems, flows, bugs and changes; `skit` for concepts. Also `prreview`, `tierlist`, `groupchat`.

| MCP tool | Python |
| --- | --- |
| get_video_formats | `format_guide(format, language)` |
| list_video_voices | `config()` |
| validate_video_script | `validate(request)` |
| generate_short_video | `generate(request)` or `make_video(request)` |
| get_video_status | `status(job_id)` / `wait(job_id)` |
| get_video_learning_pack | `learning_pack(job_id)` |
| list_videos | `list_videos(q=..., format=...)` |
| get_learning_guide | `learning_guide(session_id=None)` |
| record_learning_session | `record_session(checkpoint)` |
| get_learning_session / list_learning_sessions | `get_session(id)` / `list_sessions()` |
| publish_session_lesson | `publish_lesson(session_id, video)` |
| search_broll_image | `search_image(query)` |

Errors raise `BrainrottenError` with `.status`, `.message` and `.issues` (the exact validation problems to fix). Generating spends speech credits (and one free hosted video); validation never does.
