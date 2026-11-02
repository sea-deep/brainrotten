# BrainRotGram — Android app brief

**Deadline: 4 November 2026. Feature freeze at noon.**

BrainRotGram is Instagram for learning from your own code. Your coding agent turns what it just did into one-minute videos (sketch boards, character skits, PR reviews, tier lists, group chats). You sign in, scroll them like reels, answer the questions they ask, and make new ones in the in-app Studio. Everything you see comes from your own Brainrotten account.

The backend is live; the app only calls it. The app lives in its own repository, **sea-deep/brainrotgram**, as `BRIEF.md` (this file), `API.md` (a copy of [ANDROID-INTEGRATION.md](ANDROID-INTEGRATION.md)) and `AGENTS.md`.

---

## Paste this into your coding agent

> Build **BrainRotGram**, a Flutter Android app (application id `com.brainrotgram.app`) for the Brainrotten hosted API. Follow `BRIEF.md` (screens, priorities, design) and `API.md` (auth values, endpoints, JSON shapes, error rules) in this repository exactly; read `AGENTS.md` first. The app is gated: nothing but the sign-in screen is visible until the user signs in with Google through Amazon Cognito (authorization code + PKCE with `flutter_appauth`, public client `162fuccsquq1md62vftam7cnjc`, redirect `brainrotgram://auth/callback`, scopes `openid email profile`, extra parameter `identity_provider=Google`). Keep the refresh token in `flutter_secure_storage`, refresh silently, and send the **access token** (never the ID token) as `Authorization: Bearer`. Every screen shows the signed-in user's own data from the API: there is no public or sample feed. Use Riverpod, go_router, dio and video_player. Build the P0 list in order and keep the app runnable after each step; only then do P1. Never hard-code secrets, never invent endpoints, and handle 401 (refresh once, then back to sign-in), 402 quota, 409 version conflicts and expired media links as described. Write widget tests for the quiz timing and the review conflict retry.

---

## Stack

Flutter, Android only. One codebase, fast UI work, mature packages. (Kotlin + Compose is fine if that is much faster for you; do not switch halfway.)

| Need | Package |
|---|---|
| Sign-in (Cognito + Google, PKCE) | `flutter_appauth` — add `manifestPlaceholders += [appAuthRedirectScheme: 'brainrotgram']` in `android/app/build.gradle` |
| Tokens | `flutter_secure_storage` |
| HTTP | `dio` (interceptor: add token; on 401 refresh once and retry; if refresh fails, sign out to the gate) |
| Video | `video_player` in a vertical `PageView`; keep at most 3 players alive |
| State / routing | `flutter_riverpod`, `go_router` (redirect to `/signin` when signed out) |
| Images | `cached_network_image` |
| Haptics, share | `HapticFeedback` (built in), `share_plus` |

| Live value | |
|---|---|
| API base | `https://fqfewiusg8.execute-api.ap-south-1.amazonaws.com/api/v1` |
| Cognito domain | `https://brainrotten.auth.ap-south-1.amazoncognito.com` |
| Android client ID | `162fuccsquq1md62vftam7cnjc` (public, no secret) |
| Redirect / sign-out | `brainrotgram://auth/callback` / `brainrotgram://auth/signout` |
| Character pictures | `https://d3sk6lwsh4ufyv.cloudfront.net/characters/<id>.png` (ids from `GET /studio/config`) |
| Website (for share links) | `https://d3sk6lwsh4ufyv.cloudfront.net` |

---

## App structure (like Instagram)

```
Sign-in gate ──► Bottom nav:  Home  ·  Search  ·  ( + Studio )  ·  Sessions  ·  Profile
```

- **Home** — full-screen reels of *your* videos (`GET /library?state=ready`, paged with `nextCursor`). Pull to refresh; new videos your agent made appear at the top.
- **Search** — your library with filters.
- **Studio (+)** — make a video.
- **Sessions** — the learning checkpoints your coding agent recorded, like an inbox.
- **Profile** — you, your stats, your grid of videos, Saved, sign out.

---

## Scope

### P0 — must work by the demo (build in this order)

1. **Sign-in gate.** First launch shows a single screen: the BrainRotGram wordmark, one line ("Your agent's work, as reels"), and **Continue with Google**. Nothing else is reachable while signed out. After sign-in, land on Home. Next launches skip the gate while the refresh token works. Show the user's name and picture from the ID token claims (`name`, `email`, `picture`; if there is no picture, show the first letter of the name) — display only, never send the ID token to the API.
2. **Home reels.** Full-screen vertical swipe of the user's ready videos, newest first. Autoplay the visible one, tap to pause, long-press to hold, thin progress bar, format chip (Sketch board, Character skit, PR review, Tier list, Group chat) and title. Preload the next. Resume where the user left off (`GET /videos/{id}/review` → `positionMs`). Media links expire after 1 hour: on a player error, re-fetch `GET /videos/{id}` and retry once.
   **Empty account:** two big cards instead of reels — **Make your first video** (opens Studio) and **Connect your coding agent** (shows the command `pnpm brainrotten login --api-url <API base>` and explains that videos the agent makes appear here).
3. **Interactive Pause & Predict.** Load the learning pack (`GET /videos/{id}/learning`). When playback reaches a question whose `id` starts with `pause-`, slide up a question card over the bottom third (never cover the middle of the video). The silence is already in the audio, so keep playing. The user taps a choice: lock it, light it green or red with a haptic, and at the question's `endMs` show the right answer and the one-line explanation. Save with `PUT /videos/{id}/review` `{kind:"answer", questionId, choice, expectedVersion}`. If the user already answered (in `review.answers`), show their answer instead of asking again.
4. **End-of-video quiz.** When a video ends, a full-screen card: every remaining question (`q1`, `q2`, …) one at a time, tap to answer with instant feedback and explanation, then a score ("2 of 3"), the `takeaway`, and buttons **Replay**, **Retry quiz** (`kind:"reset-answers"`), **Next**.
5. **Studio (+).** One screen to make a video:
   - **Topic** (required, multi-line: paste an error, a diff summary or a question).
   - **Format** cards with one-line descriptions, Sketch board selected by default.
   - **Language**: English, Hinglish, Benglish.
   - **Voices**, depending on the format's `speakers` in `GET /studio/config`: for Character skit, "Let AI pick" or two character pickers (asker and explainer) with their pictures; for one-voice formats (Sketch board, Tier list) one narrator picker; for PR review and Group chat, AI picks.
   - **Questions**: 1–3.
   - A **"N of 5 free videos left"** line from `GET /me`.
   **Generate** sends `POST /videos` with a fresh `requestId` (reuse it if the same submit is retried). Then a progress screen with the job's real `stage` and `progress` (poll every 3 s for 30 s, then every 10 s). The user can leave; a small "Making 1 video" pill stays on Home until it is ready, then a banner "Your video is ready" opens it. `402 QUOTA_EXCEEDED` → "You've used your 5 free videos."
6. **Profile.** Picture, name, email; quota ring ("3 of 5 left"); a 3-column grid of the user's videos (posters, tap to play in the reel viewer) with a **Saved** tab (`GET /library?review=bookmarked`); **Sign out** (clear storage, open the Cognito logout URL, back to the gate).

### P1 — if P0 is solid

7. **Sessions inbox.** `GET /sessions`: title and date, an unread dot when the learner has not started it (`GET /sessions/{id}/review` → nothing saved yet). Session screen in four steps: **Predict** (free text + confidence 1–5, or skip) → **Watch** (the session's video, with the quiz) → **Practise** (the practice task, mark done) → **Reflect** (explanation, confidence, next action). Each step is `PUT /sessions/{id}/review` with `expectedVersion`; on 409 take the server's version from the response and retry once.
8. **Search.** A search field and chips: format, and progress (`unwatched`, `in-progress`, `completed`, `unanswered`, `needs-practice`) via `GET /library?q=&format=&review=`. Results as a poster grid.
9. **Save and react.** Double-tap a reel to save it (heart-style burst, `kind:"bookmark"`); a save icon on the right rail too.
10. **Stats on Profile.** Videos made, videos finished, quiz accuracy — computed from the library and reviews.

### P2 — only if there is time

Transcript sheet (from the learning pack, tap a line to jump), flashcards deck, share (`share_plus` with the video title and website link), daily streak (stored on the device), dark theme.

### Out of scope

Public or sample feeds, following other users, comments, offline mode, push notifications, uploading media, iOS.

---

## Design

- Palette: cream `#FAF5EE`, plum `#30263C` (text, primary buttons), lavender `#E9DFF6`, purple accent `#684393`, coral `#F0B19B`, yellow `#F1D181`. Green and red only for right/wrong answers.
- Fonts: **Basteleur Bold** for the wordmark and big titles, **Uncut Sans** for everything else (in `assets/fonts`, OFL licences included).
- Reels are black-backed and full screen; overlays stay at the bottom and right rail. Never cover the middle of an interface-style video (diagram, PR, chat, tier board).
- Short, plain labels. Show real states only: the actual render stage, never a fake progress bar.

---

## Gotchas

- **Access token, not ID token,** in `Authorization`. The ID token is only for showing the name and picture.
- **Redirect must match exactly:** `brainrotgram://auth/callback`.
- **Signed media links expire in 1 hour;** files after 30 days (`mediaExpired: true`, URLs null → show "Expired").
- **Review writes need `expectedVersion`.** A 409 returns the current version: retry once, never loop.
- **Errors are `{code, message, retryable}`.** Show the message; offer Retry only when `retryable` is true.
- **New accounts have no videos.** The empty state is part of the demo, not an edge case.
- **Five free videos per account, ever.** Use the free `POST /videos/validate` while building; generate sparingly.

---

## Two-day plan

| When | Goal |
|---|---|
| **2 Nov, evening** | Project, theme, fonts; sign-in gate working on a real phone; Home reels from the account. |
| **3 Nov** | Pause & Predict + end quiz; Studio with progress; Profile with grid, Saved and sign out. Release APK on a phone. |
| **4 Nov, until noon** | Sessions inbox and Search if time; fixes; icon and splash; record the demo; signed release APK. |

## Demo script (90 seconds)

1. Open the app: the sign-in gate. Continue with Google.
2. Home: swipe your reels; a Pause & Predict question pops up, answer it; the end quiz shows your score and the takeaway.
3. Tap **+**: paste "why did my Lambda say cannot find module", pick Sketch board, Generate; watch the real stages; the banner opens the new video.
4. Profile: "4 of 5 left", your grid, Saved. (P1: open a session your agent recorded and reflect.)

## Done means

- A signed release APK that installs on a real Android phone.
- Signed out, only the gate is visible. Signed in, every screen shows that account's data.
- Quiz answers and saves survive an app restart (they are stored on the account).
- No crash offline, out of quota, or when a media link expires.
- Widget tests for the quiz timing and the 409 retry pass.
