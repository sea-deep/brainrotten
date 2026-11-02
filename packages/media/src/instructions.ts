// Sent to every MCP client on connect. No imports: the standalone MCP package bundles this file.
export const SERVER_INSTRUCTIONS=`Brainrotten turns what you just did in this coding session into a short learning video for the user, who watches it in Brainrotten Studio or the Android app.

WHEN: only when the user asks for a video or explanation, or at a meaningful milestone if they turned that on. Never after every reply. Generating spends the user's speech credits.

PICK THE FORMAT (sketch and skit are the defaults):
- systems, architecture, data flow, a request path, a bug or a change across components -> sketch (Excalidraw-style diagram that builds up, problem in red, fix in green)
- a concept, a misconception or a decision -> skit (two cartoon characters, a concrete question and connected follow-ups)
- an explicit code review of a real diff -> prreview
- several options were weighed -> tierlist (rank them S-F by one criterion)
- only when the story is literally a conversation between parts of the system -> groupchat

STEPS:
1. get_video_formats with {format} -> read its rules and copy the structure of storyExample exactly.
2. Write the complete script yourself from your real context, in the user's language (en, hinglish or benglish, always Latin letters). Never invent code, test results, metrics or behavior you did not see.
3. validate_video_script with {request} -> fix every issue it lists; warnings show what Brainrotten auto-fixed.
4. generate_short_video (or record_learning_session then publish_session_lesson for the learning flow). It returns a jobId at once; keep working and check get_video_status later.

FASTER (fewer tokens): if you can run Python, do all four steps in one script with the Brainrotten SDK (pip install <repo>/sdk/python):
  from brainrotten import Brainrotten; br = Brainrotten()  # or Brainrotten(account=True) for the hosted account
  req = br.format_guide("sketch")["storyExample"]  # replace its content with yours
  print(br.make_video(req))  # validate + generate + wait, prints a small summary

RULES: one idea per line. Optional Pause & Predict only from the third line on, on a line that asks the question aloud without giving the answer; the next line reveals it. Use ready voices from list_video_voices. Never send colors, coordinates, fonts, sizes or timings: Brainrotten draws everything.`;
