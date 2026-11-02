# BrainRotGram — everything you need to build the Android app

**Deadline: 4 November 2026. Feature freeze at noon.**

BrainRotGram is Instagram for learning from your own code. Your coding agent turns what it just did into one-minute videos (sketch boards, character skits, PR reviews, tier lists, group chats). You sign in, scroll them like reels, answer the questions they ask, and make new ones in the in-app Studio. Everything you see comes from your own Brainrotten account.

The backend is live; the app only calls it. **This one file is the whole spec**: the brief, the rules for your coding agent, and the full API reference (Part 3). Make the app in your own new repository and copy this file into it.

---

# Part 1 — The brief

## Paste this into your coding agent

> Build **BrainRotGram**, a Flutter Android app (application id `com.brainrotgram.app`) for the Brainrotten hosted API. Follow `BRAINROTGRAM.md` in this repository exactly: Part 1 (screens, priorities, design), Part 2 (rules) and Part 3 (auth values, endpoints, JSON shapes, error rules). The app is gated: nothing but the sign-in screen is visible until the user signs in with Google through Amazon Cognito (authorization code + PKCE with `flutter_appauth`, public client `162fuccsquq1md62vftam7cnjc`, redirect `brainrotgram://auth/callback`, scopes `openid email profile`, extra parameter `identity_provider=Google`). Keep the refresh token in `flutter_secure_storage`, refresh silently, and send the **access token** (never the ID token) as `Authorization: Bearer`. Every screen shows the signed-in user's own data from the API: there is no public or sample feed. Use Riverpod, go_router, dio and video_player. Build the P0 list in order and keep the app runnable after each step; only then do P1. Never hard-code secrets, never invent endpoints, and handle 401 (refresh once, then back to sign-in), 402 quota, 409 version conflicts and expired media links as described. Write widget tests for the quiz timing and the review conflict retry.

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
6. **Profile.** Picture, name, email; quota ring ("3 of 5 left"); a 3-column grid of the user's videos (posters, tap to play in the reel viewer) with a **Saved** tab (`GET /library?review=bookmarked`); **Sign out** (clear storage, open the Cognito logout URL, back to the gate). An **About** row shows: “Unofficial, non-commercial fan project. Characters and gameplay belong to their owners; voices are AI clones.” and opens `https://d3sk6lwsh4ufyv.cloudfront.net/credits.html`. The sign-in gate shows the same first sentence in small print.

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
- Fonts: **Basteleur Bold** for the wordmark and big titles, **Uncut Sans** for everything else. TTF files (OFL licences included) are in the Brainrotten repo at `apps/web/public/fonts/`; copy them into `assets/fonts`.
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

---

# Part 2 — Rules for your coding agent

Rules for any coding agent working in this repository (Claude Code, Codex, Kiro, Gemini, …).

## Read first

1. Part 1 — what to build, in what order, and how it should look. P0 before P1, always.
2. Part 3 — the live Brainrotten API: auth values, every endpoint, request and response shapes, error rules. Do not invent endpoints or fields; if something is missing, say so.

## Project

- Flutter, Android only. Application id `com.brainrotgram.app`.
- If `pubspec.yaml` does not exist yet, create the project in this folder:
  `flutter create --org com.brainrotgram --project-name brainrotgram --platforms android .`
- Fonts go in `assets/fonts` (Basteleur Bold for the wordmark and titles, Uncut Sans for everything else). Register them in `pubspec.yaml`.
- Packages: `flutter_riverpod`, `go_router`, `dio`, `flutter_appauth`, `flutter_secure_storage`, `video_player`, `cached_network_image`, `share_plus`.
- Suggested layout: `lib/auth`, `lib/api` (dio client + models), `lib/features/{home,search,studio,sessions,profile,player,quiz}`, `lib/theme`.

## Non-negotiable

- **Signed out, only the sign-in screen exists.** go_router redirects every other route to `/signin`.
- **Access token** in `Authorization: Bearer`. Never send the ID token to the API.
- **No secrets in the repo.** The Cognito client is public (PKCE, no secret); there is nothing else to store.
- **Every screen shows the signed-in account's own data.** No sample or public feed.
- Handle 401 (refresh once, then back to sign-in), 402 quota, 409 version conflict (retry once with the server's version), and expired media links (re-fetch the video, retry once).
- Keep the app runnable after every step. Run `flutter analyze` and `flutter test` before saying something is done, and say what you tested on a real device versus not.
- Generating a video uses one of the account's 5 free videos. Use `POST /videos/validate` (free) while developing; only generate when the user asks.
- Commit messages: plain and specific. No co-author or AI attribution lines.

## Commands

```bash
flutter pub get
flutter analyze
flutter test
flutter run                      # on a connected phone
flutter build apk --release      # the demo build
```

---

# Part 3 — API reference

> The app is Flutter: where this reference names Kotlin libraries (AppAuth-Android, Retrofit, Media3), use the Flutter packages from Part 1 (`flutter_appauth`, `dio`, `video_player`). Values, endpoints and JSON shapes are the same.
This document gives BrainRotGram Android developers everything needed to authenticate users
and call the Brainrotten hosted API. Values below are from the deployed `brainrotten-api` stack (ap-south-1).

---

### Environments

| Name | Value |
|---|---|
| API base URL | `https://fqfewiusg8.execute-api.ap-south-1.amazonaws.com/api/v1` |
| Website | `https://d3sk6lwsh4ufyv.cloudfront.net` (S3 + CloudFront). The Android app does not need the website. |
| AWS region | `ap-south-1` |
| API stack | `brainrotten-api` |
| Website hosting | Stack `brainrotten-site` (private S3 bucket, CloudFront with security headers) |

---

### Authentication — Cognito with Google via Authorization Code + PKCE

#### Cognito configuration

| Name | Value |
|---|---|
| User pool ID | `ap-south-1_QIYaO2Hex` |
| Android client ID | `162fuccsquq1md62vftam7cnjc` |
| Cognito domain | `https://brainrotten.auth.ap-south-1.amazoncognito.com` |
| Issuer URL | `https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_QIYaO2Hex` |
| Authorize endpoint | `https://brainrotten.auth.ap-south-1.amazoncognito.com/oauth2/authorize` |
| Token endpoint | `https://brainrotten.auth.ap-south-1.amazoncognito.com/oauth2/token` |
| Logout endpoint | `https://brainrotten.auth.ap-south-1.amazoncognito.com/logout` |
| JWKS URI | `https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_QIYaO2Hex/.well-known/jwks.json` |
| Redirect URI | `brainrotgram://auth/callback` |
| Sign-out URI | `brainrotgram://auth/signout` |
| Scopes | `openid email profile` |
| Client secret | **None** — public client, PKCE only |

#### Recommended library

Use **AppAuth-Android** (`net.openid:appauth:0.11.1`). It handles PKCE, Chrome Custom Tabs
launch, intent interception, and token refresh without manual OAuth plumbing.

```kotlin
// build.gradle.kts
implementation("net.openid:appauth:0.11.1")
```

Register the redirect URI as an intent filter in `AndroidManifest.xml`:

```xml
<activity android:name="net.openid.appauth.RedirectUriReceiverActivity"
          android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="brainrotgram" android:host="auth" android:path="/callback" />
  </intent-filter>
</activity>
```

#### Authorization code + PKCE flow

```kotlin
// 1. Build the service configuration
val serviceConfig = AuthorizationServiceConfiguration(
    Uri.parse("https://brainrotten.auth.ap-south-1.amazoncognito.com/oauth2/authorize"),
    Uri.parse("https://brainrotten.auth.ap-south-1.amazoncognito.com/oauth2/token")
)

// 2. Build the authorization request (AppAuth generates code_verifier + code_challenge)
val request = AuthorizationRequest.Builder(
    serviceConfig,
    "<CognitoAndroidClientId>",
    ResponseTypeValues.CODE,
    Uri.parse("brainrotgram://auth/callback")
)
    .setScope("openid email profile")
    .build()

// 3. Launch Chrome Custom Tab
val authService = AuthorizationService(context)
val intent = authService.getAuthorizationRequestIntent(request)
startActivityForResult(intent, RC_AUTH)

// 4. In onActivityResult — exchange code for tokens
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == RC_AUTH) {
        val response = AuthorizationResponse.fromIntent(data!!)
        val ex = AuthorizationException.fromIntent(data)
        if (response != null) {
            authService.performTokenRequest(
                response.createTokenExchangeRequest()
            ) { tokenResponse, tokenEx ->
                if (tokenResponse != null) {
                    // Store securely — see Token Storage below
                    saveTokens(
                        accessToken  = tokenResponse.accessToken!!,
                        refreshToken = tokenResponse.refreshToken!!,
                        expiresAt    = tokenResponse.accessTokenExpirationTime!!
                    )
                }
            }
        }
    }
}
```

#### Token storage

Store tokens in **EncryptedSharedPreferences** backed by Android Keystore. Never store in
plain `SharedPreferences`, logs, or `Intent` extras.

```kotlin
val prefs = EncryptedSharedPreferences.create(
    context,
    "brainrotgram_tokens",
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
```

#### Making API calls

Always use the **access token**, never the ID token. The API explicitly rejects ID tokens
(`token_use` claim must be `access`).

```kotlin
val response = okHttpClient.newCall(
    Request.Builder()
        .url("$API_BASE_URL/me")
        .header("Authorization", "Bearer $accessToken")
        .build()
).execute()
```

#### Token refresh

Access tokens expire after **1 hour**. Refresh tokens last **30 days** and rotate on each use.

```kotlin
authState.performActionWithFreshTokens(authService) { accessToken, _, ex ->
    if (ex != null) {
        // Refresh token expired — prompt user to sign in again
    } else {
        makeApiCall(accessToken!!)
    }
}
```

#### Sign out

```kotlin
// 1. Revoke tokens at Cognito
val logoutUri = Uri.parse(
    "https://brainrotten.auth.ap-south-1.amazoncognito.com/logout" +
    "?client_id=<CognitoAndroidClientId>" +
    "&logout_uri=brainrotgram://auth/signout"
)
val logoutIntent = Intent(Intent.ACTION_VIEW, logoutUri)
startActivity(logoutIntent)

// 2. Clear local token storage
authState.update(null as AuthorizationResponse?, null)
prefs.edit().clear().apply()
```

---

### API endpoints

Base: `<ApiBaseUrl>` (no trailing slash). All authenticated endpoints require
`Authorization: Bearer <access_token>`.

#### Public endpoints (no auth)

##### GET /health
Returns API liveness and trial status.

```json
// Response 200
{ "status": "ok", "service": "brainrotten-api", "hostedEnabled": true }
```

##### GET /openapi.json
Returns the full OpenAPI 1.3 spec. Use this to generate a typed client.

##### GET /studio/config
Returns capability flags and auth config. Never contains provider secrets.

```json
// Response 200 (hosted, trial enabled)
{
  "mode": "hosted",
  "auth": {
    "configured": true,
    "clientId": "<CognitoAndroidClientId>",
    "issuer": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_QIYaO2Hex",
    "domain": "https://brainrotten.auth.ap-south-1.amazoncognito.com",
    "loginUrl": "https://brainrotten.auth.ap-south-1.amazoncognito.com/oauth2/authorize"
  },
  "formats": [{ "id": "skit", "ready": true }, ...],
  "voiceConfigured": true
}
```

---

#### Account

##### GET /me
Returns the authenticated user's quota.

```json
// Response 200
{
  "quota": { "used": 1, "limit": 5, "remaining": 4 }
}
```

Errors: `401` (invalid/expired token), `503` (trial not configured).

---

#### Videos

##### POST /videos
Submit a video for generation. Costs one quota slot (idempotent on `requestId`).

```json
// Request body
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "prompt": "Explain why idempotency keys matter for payment retries",
  "format": "skit",
  "language": "en",
  "durationSeconds": 60
}
```

```json
// Response 202
{
  "jobId": "11111111-1111-4111-8111-111111111111",
  "state": "queued",
  "stage": "queued",
  "progress": 0,
  "createdAt": "2026-11-01T10:00:00.000Z"
}
```

Errors: `401`, `402 QUOTA_EXCEEDED`, `409 REQUEST_CONFLICT` (same `requestId`, different payload),
`422` (invalid script/format), `503`.

##### GET /videos
List all videos for the authenticated user, newest first. Includes signed media URLs.

```json
// Response 200
{
  "jobs": [
    {
      "jobId": "11111111-1111-4111-8111-111111111111",
      "state": "ready",
      "title": "Idempotency keys",
      "format": "skit",
      "createdAt": "2026-11-01T10:00:00.000Z",
      "videoUrl": "https://...",
      "posterUrl": "https://...",
      "audioUrl": "https://...",
      "mediaExpired": false,
      "mediaExpiresAt": "2026-12-01T10:00:00.000Z"
    }
  ]
}
```

##### GET /videos/{jobId}
Get a single video job with signed media URLs.

```json
// Response 200 (state: ready)
{
  "jobId": "11111111-1111-4111-8111-111111111111",
  "state": "ready",
  "stage": "ready",
  "progress": 100,
  "title": "Idempotency keys",
  "format": "skit",
  "durationSeconds": 58,
  "videoUrl": "https://signed-s3-url...",
  "posterUrl": "https://signed-s3-url...",
  "audioUrl":  "https://signed-s3-url...",
  "downloadUrl": "https://signed-s3-url...",
  "mediaExpired": false,
  "mediaExpiresAt": "2026-12-01T10:00:00.000Z",
  "outputs": {
    "learningUrl":  "https://...",
    "notesUrl":     "https://...",
    "captionsUrl":  "https://...",
    "flashcardsUrl": "https://..."
  },
  "learning": { "schemaVersion": "BrainrottenLearningPackV1", ... }
}
```

Poll this endpoint for job status. Suggested cadence: every 3 s for the first 30 s, then
every 10 s. States: `queued` → `processing` → `ready` | `failed` | `needs_review`.

Errors: `401`, `404` (not found or belongs to another user).

##### GET /videos/{jobId}/learning
Returns the `LearningPackV1` JSON for a ready job.

```json
// Response 200
{
  "schemaVersion": "BrainrottenLearningPackV1",
  "jobId": "...",
  "format": "skit",
  "title": "Idempotency keys",
  "language": "en",
  "durationSeconds": 58,
  "takeaway": "Reuse the purchase key across retries.",
  "chapters": [{ "id": "ch1", "title": "The problem", "startMs": 0, "endMs": 20000 }],
  "questions": [
    {
      "id": "q1",
      "prompt": "What does the idempotency key prevent?",
      "choices": ["Double charge", "Slow network", "Wrong currency", "Timeout"],
      "answer": 0,
      "explanation": "The same key returns the same result.",
      "startMs": 5000,
      "endMs": 18000
    },
    {
      "id": "pause-3",
      "prompt": "What happens on the second retry?",
      "choices": ["New charge", "Same result", "Error", "Refund"],
      "answer": 1,
      "explanation": "The stored result is returned.",
      "startMs": 30000,
      "endMs": 45000
    }
  ],
  "flashcards": [
    { "id": "fc1", "front": "Idempotency key", "back": "Stable ID that deduplicates an operation", "startMs": 0, "endMs": 10000 }
  ],
  "transcript": [{ "turnIndex": 0, "speaker": "jack", "text": "Reuse the key.", "startMs": 0, "endMs": 5000 }]
}
```

Note: questions with IDs like `pause-3` are Pause & Predict questions inserted at silent
pauses in the video. The player should show them at the matching timestamp.

Errors: `401`, `404` (job not found, not ready, or no learning pack).

##### POST /videos/validate
Validate a script without generating or reserving quota.

```json
// Request body — same shape as POST /videos
{ "prompt": "...", "format": "skit", "language": "en" }

// Response 200
{
  "valid": true,
  "issues": [],
  "warnings": ["Line 2: emoji removed from spoken text"],
  "estimatedSeconds": 62,
  "speakers": ["jack", "jhatka"],
  "spokenCharacters": 480,
  "generationReady": true
}
```

---

#### Video review (watch position, answers, bookmarks)

##### GET /videos/{jobId}/review

```json
// Response 200
{
  "schemaVersion": "BrainrottenReviewV1",
  "jobId": "11111111-1111-4111-8111-111111111111",
  "version": 0,
  "positionMs": 0,
  "furthestMs": 0,
  "completed": false,
  "bookmarked": false,
  "answers": {},
  "updatedAt": null
}
```

##### PUT /videos/{jobId}/review
Patch the review. Always include `expectedVersion` (optimistic locking).

**Save watch position:**
```json
{ "kind": "watch", "expectedVersion": 0, "positionMs": 12500 }
```

**Answer a question:**
```json
{ "kind": "answer", "expectedVersion": 1, "questionId": "q1", "choice": 0 }
```

**Bookmark:**
```json
{ "kind": "bookmark", "expectedVersion": 2, "value": true }
```

**Reset answers** (keeps watch position and bookmarks):
```json
{ "kind": "reset-answers", "expectedVersion": 3 }
```

```json
// Response 200
{
  "schemaVersion": "BrainrottenReviewV1",
  "jobId": "...",
  "version": 1,
  "positionMs": 12500,
  "furthestMs": 12500,
  "completed": false,
  "bookmarked": false,
  "answers": {},
  "updatedAt": "2026-11-01T10:05:00.000Z"
}
```

Errors: `401`, `404`, `409 CONFLICT` (version mismatch — read `review` in response body,
update your local version, and retry the specific patch), `422` (invalid action/questionId).

---

#### Library search

##### GET /library

Query parameters:

| Param | Values | Default |
|---|---|---|
| `q` | substring search (≤ 120 chars) | — |
| `format` | `skit` `groupchat` `prreview` `sketch` `tierlist` `casefile` `whiteboard` `pov` | — |
| `state` | `queued` `processing` `ready` `failed` `needs_review` | — |
| `review` | `all` `unwatched` `in-progress` `completed` `unanswered` `needs-practice` `bookmarked` | — |
| `limit` | 1–50 | 12 |
| `cursor` | from previous `nextCursor` | — |

```json
// Response 200
{
  "jobs": [
    {
      "jobId": "...",
      "title": "Idempotency keys",
      "format": "skit",
      "state": "ready",
      "questionCount": 2,
      "posterUrl": "https://...",
      "mediaExpired": false,
      "mediaExpiresAt": "2026-12-01T10:00:00.000Z",
      "createdAt": "2026-11-01T10:00:00.000Z",
      "reviewState": "unwatched"
    }
  ],
  "nextCursor": "eyJwayI6IlVTRVIjYWxpY2UiLCJzayI6IkpPQiMxMTExMSJ9"
}
```

Errors: `400` (invalid cursor — restart from page 1), `401`.

---

#### Learning sessions

##### GET /learning-guide
Returns the versioned teaching workflow and format routing. No auth required.

##### POST /sessions
Record a learning checkpoint (idempotent on `requestId`).

```json
// Request body
{
  "requestId": "session-checkpoint-01",
  "title": "Tracing payment retries",
  "projectName": "Checkout",
  "agent": "MCP",
  "objective": "Understand why idempotency keys prevent double charges.",
  "context": {
    "task": "Trace payment retry behaviour",
    "summary": "A charge succeeded but the response was lost."
  },
  "activity": {
    "predictionPrompt": "What happens if a retry sends a fresh idempotency key?",
    "practice": {
      "prompt": "Trace two retries of a payment with the same key.",
      "successCriteria": "One charge with the stored result reused twice."
    }
  }
}
```

```json
// Response 201
{
  "sessionId": "22222222-2222-4222-8222-222222222222",
  "requestId": "session-checkpoint-01",
  "title": "Tracing payment retries",
  "formatRecommendation": { "format": "prreview", "reason": "Code changed", "chosenBy": "routing-guide" },
  "createdAt": "2026-11-01T10:00:00.000Z"
}
```

Errors: `401`, `409` (same `requestId`, different context), `422`.

##### GET /sessions
List session summaries (no context/code in list items).

```
GET /sessions?limit=20&cursor=<nextCursor>
```

```json
// Response 200
{
  "sessions": [{ "sessionId": "...", "title": "...", "createdAt": "..." }],
  "nextCursor": null
}
```

##### GET /sessions/{sessionId}
Full session including linked videos and saved review.

```json
// Response 200
{
  "session": { "sessionId": "...", "title": "...", "context": { ... }, "activity": { ... } },
  "review": { "version": 0, "prediction": null, "practice": null, "reflection": null },
  "videos": [ /* VideoJob array */ ]
}
```

##### GET /sessions/{sessionId}/guide
Returns the teaching guide in the context of this session.

##### GET /sessions/{sessionId}/review
Returns the learner's saved predict / practice / reflect responses.

```json
// Response 200
{
  "sessionId": "...",
  "version": 1,
  "prediction": { "text": "A new key allows another charge.", "confidence": 4, "skipped": false },
  "practice": null,
  "reflection": null,
  "updatedAt": "2026-11-01T10:10:00.000Z"
}
```

##### PUT /sessions/{sessionId}/review
Write a learner response. **Android (first-party) client allowed. Agent client blocked (403).**
Always include `expectedVersion`.

**Prediction:**
```json
{ "kind": "predict", "expectedVersion": 0, "text": "A new key creates a duplicate charge.", "confidence": 4, "skipped": false }
```

**Practice completion:**
```json
{ "kind": "practice", "expectedVersion": 1, "completed": true, "traps": ["sunk-cost"] }
```

**Reflection:**
```json
{ "kind": "reflect", "expectedVersion": 2, "explanation": "The key identifies the operation.", "confidence": 4, "nextAction": "Check uniqueness boundaries." }
```

Errors: `401`, `403` (agent client — Android should never see this), `404`, `409` (version
mismatch — read `sessionReview` in response, update version, retry), `422`.

##### POST /sessions/{sessionId}/videos
Publish a lesson video linked to a session. Same body and idempotency rules as `POST /videos`
but must include a complete script with comprehension questions.

---

#### Image search

##### POST /images/search
Search for B-roll gameplay images.

```json
// Request
{ "query": "payment terminal", "count": 3 }

// Response 200
{ "images": [{ "url": "https://...", "alt": "Payment terminal" }] }
```

Errors: `401`, `422`, `502` (upstream search failed).

---

### Integration rules

#### requestId idempotency
Every `POST /videos` and `POST /sessions` must include a stable `requestId` (UUID v4
recommended). Sending the same `requestId` again returns the original response without
consuming another quota slot or creating a duplicate session. A **changed payload** with the
same `requestId` returns **409** — this means your app submitted conflicting data for the same
logical operation. Generate a new `requestId` for genuinely new submissions.

#### 409 conflict handling
```kotlin
// On 409 for a review/session-review PUT:
val conflict = gson.fromJson(errorBody, ConflictResponse::class.java)
val currentVersion = conflict.review?.version ?: conflict.sessionReview?.version
// Reconcile your local state with currentVersion, then retry with expectedVersion = currentVersion
```

#### Job status polling
```
poll GET /videos/{jobId} every 3 s for the first 30 s
then every 10 s until state is "ready", "failed", or "needs_review"
```
`needs_review` means the render job is uncertain — do not retry with a new `requestId`.
Show a "pending review" state and check again after a few minutes.

#### Signed URL expiry
- **Presigned media URLs** (`videoUrl`, `posterUrl`, `audioUrl`, `downloadUrl`, `outputs.*Url`)
  expire after **1 hour**. Re-fetch `GET /videos/{jobId}` to get fresh links.
- **Files themselves** expire after **30 days** (`mediaExpiresAt`). After that, `mediaExpired`
  is `true` and all media URLs are `null`. Learning metadata and review data remain readable.

#### Hosted quota
Each user gets **5 lifetime videos**. There is no reset.

```json
// 402 response when quota is exhausted
{
  "code": "QUOTA_EXCEEDED",
  "message": "You have used all 5 lifetime trial videos.",
  "retryable": false
}
```

#### Error shape
All error responses follow:
```json
{ "code": "ERROR_CODE", "message": "Human-readable message.", "retryable": true | false }
```

Common codes: `QUOTA_EXCEEDED` (402), `REQUEST_CONFLICT` (409), `TRIAL_DISABLED` (503).
The `retryable` field tells you whether the same request might succeed later.

#### Learner-only writes
`PUT /sessions/{sessionId}/review` (predict, practice, reflect) is for the **learner only**.
The Android app (BrainRotGram) is a first-party learner client and is explicitly allowed.
The MCP agent client is blocked from this route (returns 403).

---

### Formats

#### Current (creatable)

| Format | Description | Layout |
|---|---|---|
| `skit` | Two characters, question-answer | Character cutouts, karaoke captions, B-roll |
| `groupchat` | WhatsApp-style group thread | Chat bubbles, member avatars, reactions |
| `prreview` | GitHub-style PR diff and review | Diff viewer, anchored comments, verdict badge |
| `sketch` | Excalidraw-style architecture board | Dagre layout, rough.js shapes, Virgil font |
| `tierlist` | TierMaker ranking board | S/A/B/C/D rows, criterion label |

#### Legacy (read-only — old videos only)

| Format | Notes |
|---|---|
| `casefile` | Retired — only readable, not creatable |
| `whiteboard` | Retired — only readable, not creatable |
| `pov` | Retired — only readable, not creatable |

#### Pause & Predict questions

The learning pack's `questions` array may include entries with IDs like `pause-3`. These are
questions inserted at real silence gaps in the video. The player should:

1. Show the question panel at `question.startMs`
2. Pause playback for the thinking gap (the silence is baked into the audio)
3. Reveal the answer at `question.endMs`
4. Send `PUT /videos/{jobId}/review` with `kind: "answer"` when the user answers

Interface formats (`groupchat`, `prreview`, `sketch`, `tierlist`) show no cartoon characters
and no captions — voices are audio only.

---

### Generated Kotlin client

Generate a typed client directly from the deployed OpenAPI spec:

```bash
# Install the generator
npm install -g @openapitools/openapi-generator-cli

# Generate a Kotlin/Retrofit client
openapi-generator-cli generate \
  -i <ApiBaseUrl>/openapi.json \
  -g kotlin \
  -o ./brainrotten-client \
  --additional-properties=library=jvm-retrofit2,serializationLibrary=gson,packageName=com.brainrotgram.api
```

Recommended Android libraries:

| Purpose | Library |
|---|---|
| HTTP client | `com.squareup.retrofit2:retrofit:2.11.0` + `com.squareup.okhttp3:okhttp:4.12.0` |
| JSON | `com.google.code.gson:gson:2.11.0` |
| Video playback | `androidx.media3:media3-exoplayer:1.4.1` + `media3-ui:1.4.1` |
| Auth | `net.openid:appauth:0.11.1` |
| Encrypted storage | `androidx.security:security-crypto:1.1.0-alpha06` |

---

### Creating a test user

While the Google OAuth app is in **Testing** mode (before publishing), only accounts you
explicitly add can sign in.

**Via Google Cloud Console:**
1. Go to https://console.cloud.google.com → your project
2. APIs & Services → OAuth consent screen → **Test users**
3. Click **Add users** → enter the Gmail address → Save

**Via AWS Cognito Console** (for direct Cognito users without Google):
1. Go to https://ap-south-1.console.aws.amazon.com/cognito → your user pool
2. Users → **Create user**
3. Set email + temporary password → Send invitation

---

### What is not yet supported

- **Offline sync** — the app requires network for all API calls; there is no local cache or
  offline mode
- **Background push notifications** — no push is sent when a video finishes rendering
- **Local/custom voice IDs** — hosted trials use project clone voices only; custom ElevenLabs
  voice IDs are rejected
- **Media upload** — the app cannot upload its own gameplay; B-roll is server-selected
- **Quota reset** — the 5-video lifetime limit has no reset; contact the project owner to
  increase quota manually
- **Multiple accounts on one device** — single active session only

---

*Values reflect the deployed `brainrotten-api` stack in ap-south-1 (2 November 2026). Regenerate the Kotlin client from the live `/api/v1/openapi.json` whenever the API version changes.*
