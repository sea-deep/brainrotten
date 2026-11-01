# Requirements: Hosted Deploy + Android Integration

Spec revision: 2026-11-01. Covers tasks 13 and 14 from the Brainrot spec and adds the
Android handoff as a first-class requirement. Region: ap-south-1 unless confirmed otherwise.

---

## Req HD-1: Preflight and tooling gate

**User story:** As the deployer, I want all tooling checks to pass before any AWS resource is
created, so a broken environment does not leave half-deployed infrastructure.

1. WHEN `pnpm check` is run THEN it SHALL exit 0 (build, typecheck, lint, all tests green).
2. WHEN AWS CLI v2 is checked THEN it SHALL be ≥ 2.x, and `aws sts get-caller-identity` SHALL
   succeed with the configured SSO profile. Root access keys SHALL NOT be used.
3. WHEN SAM CLI is checked THEN it SHALL be installed and `sam validate --lint` SHALL pass on
   `infra/sam/template.yaml`.
4. WHEN Docker is checked THEN the daemon SHALL be running and `docker buildx inspect` SHALL
   succeed.
5. WHEN the preflight script is run (`node scripts/release-preflight.mjs --aws`) THEN it SHALL
   print no errors and SHALL NOT make any paid or write AWS calls.

---

## Req HD-2: Website infrastructure (site stack)

**User story:** As the deployer, I want a stable HTTPS origin before anything else, so I can
use it as `AppOrigin` in the API stack and in the Google OAuth redirect URI.

1. WHEN `aws cloudformation deploy` is run against `infra/site/template.yaml` with stack name
   `brainrotten-site` THEN it SHALL succeed and output `SiteUrl`, `SiteBucketName` and
   `DistributionId`.
2. WHEN the `SiteUrl` is opened in a browser THEN CloudFront SHALL serve the site over HTTPS
   and SHALL redirect HTTP to HTTPS.
3. WHEN an unknown path is requested THEN known client routes (`/studio`, `/mcp`, `/api`,
   `/setup`, `/examples`, `/auth/callback`) SHALL rewrite to `/index.html`; missing assets
   SHALL NOT return HTML.
4. WHEN the stack is deleted THEN the S3 bucket SHALL be retained (DeletionPolicy: Retain).

---

## Req HD-3: Google OAuth client and Cognito secret

**User story:** As the deployer, I want Google sign-in wired through Cognito before the API
stack is deployed, so the identity provider is ready and the secret is never in plaintext in any
config or command.

1. WHEN the deployer creates the Google OAuth client THEN the authorized redirect URI SHALL be
   exactly `https://<CognitoDomainPrefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse`.
2. WHEN the Google secret is stored THEN it SHALL go into AWS Secrets Manager as the secret
   name `brainrotten/google`, as plaintext JSON with keys `client_id` and `client_secret`.
3. WHEN the SAM template is deployed THEN it SHALL receive only `GoogleClientId` (public) and
   `GoogleOAuthSecretArn` (the ARN); the raw `client_secret` value SHALL NOT appear in any
   SAM parameter, shell variable, log or commit.
4. WHEN the Cognito stack reads the secret THEN it SHALL use the CloudFormation dynamic
   reference `{{resolve:secretsmanager:...}}` at deploy time.

---

## Req HD-4: Provider secret

**User story:** As the deployer, I want the project API keys and voice registry stored in
Secrets Manager so the Lambda worker can access them without hardcoding any credential.

1. WHEN `node scripts/export-provider-secret.mjs` is run THEN it SHALL write the provider JSON
   to a private temp path (mode 0600), SHALL NOT print any key value, and SHALL refuse to
   overwrite an existing file.
2. WHEN the secret is stored THEN it SHALL go into AWS Secrets Manager as `brainrotten/providers`
   and the temp file SHALL be deleted after a confirmed upload.
3. WHEN the worker Lambda runs THEN it SHALL retrieve the secret via `PROVIDER_SECRET_ARN`
   using its IAM role; the secret value SHALL NOT appear in environment variables, logs or
   function code.

---

## Req HD-5: Android Cognito app client

**User story:** As an Android developer, I want a dedicated native Cognito app client with PKCE
support so BrainRotGram can sign users in and call the hosted API without ever holding a client
secret.

1. WHEN the SAM template is deployed THEN a `AndroidClient` resource SHALL exist in
   `infra/sam/template.yaml` with:
   - `GenerateSecret: false` (public client, no secret)
   - `AllowedOAuthFlows: [code]` (authorization code only)
   - `AllowedOAuthScopes: [openid, email, profile]`
   - `SupportedIdentityProviders` matching `WebClient` (Google when configured, otherwise COGNITO)
   - `CallbackURLs: ['brainrotgram://auth/callback']`
   - `LogoutURLs: ['brainrotgram://auth/signout']`
   - `AccessTokenValidity: 1` hour; `RefreshTokenValidity: 30` days
   - `EnableTokenRevocation: true`
2. WHEN the stack produces outputs THEN `CognitoAndroidClientId` SHALL be an output.
3. WHEN the JWT authorizer audience is configured THEN `AndroidClient` SHALL be included
   alongside `WebClient` and `AgentClient`, without relying on `AdditionalClientIds`.
4. WHEN `authenticatedSubject` in `cloud/src/api.ts` validates a token THEN a token issued to
   `AndroidClient` SHALL be accepted (client ID in the allow-set).
5. WHEN a learner-write route (session review PUT) is called with an `AndroidClient` token THEN
   it SHALL be accepted (Android is a first-party learner client, not an agent client).
6. WHEN `sam validate --lint` is run after the change THEN it SHALL pass with no errors.
7. WHEN cloud tests cover the allowlist logic THEN the test SHALL include `AndroidClient` as an
   accepted client and verify it is not blocked by the agent-client learner-write check.

---

## Req HD-6: API stack deployment (trial off)

**User story:** As the deployer, I want the authenticated API stack running with trial disabled
first, so I can verify identity and routing before any paid call can occur.

1. WHEN `sam deploy` is run with `EnableHostedTrial=false` THEN the stack SHALL create:
   the Cognito user pool and domain, `WebClient`, `AgentClient`, `AndroidClient`,
   the HTTP API with Cognito JWT authorizer, `ApiFunction`, `Worker`, `VideoQueue`,
   `DeadLetters`, `JobsTable`, `MediaBucket`, and CloudWatch log groups.
2. WHEN `GET /api/v1/health` is called (no auth) THEN it SHALL return `{"status":"ok","hostedEnabled":false}`.
3. WHEN `GET /api/v1/studio/config` is called (no auth) THEN it SHALL return the config object
   with `auth.configured: false` and SHALL NOT include any secret value.
4. WHEN `GET /api/v1/openapi.json` is called (no auth) THEN it SHALL return the OpenAPI spec.
5. WHEN any authenticated route is called without a token THEN the gateway SHALL return 401.
6. WHEN `sam validate --lint` is run before deploy THEN it SHALL pass.
7. WHEN the stack outputs are queried THEN they SHALL include `ApiBaseUrl`, `CognitoClientId`,
   `CognitoAgentClientId`, `CognitoAndroidClientId`, `CognitoUserPoolId`, `CognitoDomain`,
   `GoogleRedirectUri`, `JobsTableName`, `MediaBucketName`, and `QueueUrl`.

---

## Req HD-7: Website deployment

**User story:** As a user, I want to open the website URL and see the live Studio connected to
the hosted API, so I can sign in and start a video.

1. WHEN the site is built with `VITE_HOSTED=true` and the real `VITE_API_BASE_URL` THEN the
   build SHALL succeed with no source maps and no provider keys embedded.
2. WHEN the build output is synced to `SiteBucketName` THEN the sync SHALL use `--delete`
   scoped to that bucket; `MediaBucketName` SHALL NOT be touched.
3. WHEN a CloudFront invalidation is created THEN it SHALL invalidate `/*`.
4. WHEN the site URL is opened THEN the browser SHALL load Studio; `/api/v1/health` SHALL be
   reachable from the page without CORS errors.
5. WHEN the user navigates to `/auth/callback` directly THEN the CloudFront router SHALL serve
   `index.html` so the callback can complete.

---

## Req HD-8: Google sign-in verification (trial off)

**User story:** As a test user, I want to sign in with Google on the live site so I can confirm
identity is wired end-to-end before enabling paid generation.

1. WHEN a Google test user signs in from the live site THEN the browser SHALL redirect to the
   Cognito hosted UI, through Google, and back to `AppOrigin/auth/callback`, landing on
   `/studio`.
2. WHEN `GET /api/v1/me` is called with the resulting access token THEN it SHALL return the
   user's subject, email and `quotaRemaining: 5`.
3. WHEN an expired, wrong-client or ID token (not access token) is passed THEN the gateway
   SHALL return 401.

---

## Req HD-9: Hosted trial enablement

**User story:** As the deployer, I want a deliberate second deploy step to turn on paid
generation, with explicit confirmation, so a misconfiguration cannot accidentally trigger paid
calls.

1. WHEN the deployer asks to enable the trial THEN Kiro SHALL describe the cost impact and wait
   for explicit OK before running any command.
2. WHEN `sam deploy` is run with `EnableHostedTrial=true` THEN the `TrialEnabled` condition
   SHALL resolve to `true`, `HOSTED_ENABLED` SHALL be `'true'` in Lambda env, and
   `GET /api/v1/health` SHALL return `{"hostedEnabled":true}`.
3. WHEN `GET /api/v1/studio/config` is called THEN `auth.configured` SHALL be `true` and the
   Cognito domain, client ID and issuer SHALL be present.

---

## Req HD-10: End-to-end hosted video verification

**User story:** As the deployer, I want to submit one real hosted video and verify the full
pipeline — quota, rendering, signed URLs and the learning pack — before sharing the trial.

1. WHEN an authenticated user submits a video with a stable `requestId` THEN it SHALL reserve
   one quota slot atomically; `quotaRemaining` in `/me` SHALL drop from 5 to 4.
2. WHEN the job completes THEN `GET /api/v1/videos/{jobId}` SHALL return state `ready`,
   signed `videoUrl`, `posterUrl`, `audioUrl`, and a `learning` pack with at least one question.
3. WHEN the same `requestId` is resubmitted THEN the API SHALL return the original job (same
   `jobId`) without consuming a second slot.
4. WHEN a changed payload is submitted with the same `requestId` THEN the API SHALL return 409.
5. WHEN a second Google account calls `GET /api/v1/videos/{jobId}` for the first account's job
   THEN it SHALL return 404.
6. WHEN a sixth video is submitted after five are reserved THEN the API SHALL return 402 with
   `code: QUOTA_EXCEEDED`.
7. WHEN a signed media URL is fetched directly THEN it SHALL work; after one hour the same URL
   SHALL be expired (test by checking `expiresAt`, not by waiting).
8. WHEN the learning pack URL is fetched THEN it SHALL return the `LearningPackV1` JSON with
   flashcards and question entries including any `pause-<n>` IDs.

---

## Req HD-11: MCP account connection

**User story:** As an agent user, I want to point my local MCP at the hosted API with my
account credentials so I can generate videos that appear in my cloud library.

1. WHEN `pnpm brainrotten login --api-url <ApiBaseUrl>` is run THEN it SHALL open the Cognito
   hosted UI with the agent client, capture the callback, and store the token securely
   (mode 0600, not in logs or URLs).
2. WHEN `pnpm brainrotten mcp --account` is run THEN the MCP bridge SHALL use the stored
   account token and call the hosted API rather than the local companion.
3. WHEN one MCP tool call is made after login THEN it SHALL succeed and the resulting job SHALL
   appear in the hosted library.

---

## Req HD-12: ANDROID-INTEGRATION.md handoff document

**User story:** As an Android developer, I want a single document with all real values and
flows so I can integrate BrainRotGram without reading the whole codebase.

1. WHEN the document is written THEN it SHALL be committed to the repository root as
   `ANDROID-INTEGRATION.md` (not under `docs/`).
2. WHEN environments are listed THEN the document SHALL include `ApiBaseUrl`, site URL, region
   and both stack names with real values (no placeholders for public values; no secret values).
3. WHEN the auth flow is described THEN it SHALL cover:
   - Cognito domain, user pool ID, `CognitoAndroidClientId`, issuer URL, authorize / token /
     logout endpoints, redirect URI `brainrotgram://auth/callback`, sign-out URI
     `brainrotgram://auth/signout`, scopes `openid email profile`
   - The authorization-code + PKCE flow with AppAuth-Android (recommended library)
   - Token refresh (30-day refresh token, 1-hour access token)
   - Using only the access token as `Authorization: Bearer`; ID token is NOT accepted by the API
4. WHEN endpoints are documented THEN for every endpoint in the deployed OpenAPI spec the
   document SHALL include method, path, brief description, request/response JSON example, and
   relevant error codes.
5. WHEN integration rules are listed THEN the document SHALL include:
   - Learner-only writes (predict, practice, reflect) — agent client blocked, Android allowed
   - `requestId` idempotency pattern
   - 409 conflict handling (read `review` in response, increment version, retry patch)
   - Job status polling cadence (suggest 3 s, back off to 10 s after 30 s)
   - Signed URL expiry: media URLs 1 hour, files 30 days; re-fetch the job for fresh links
   - Hosted quota: 5 lifetime videos; 402 `QUOTA_EXCEEDED` shape
   - Error shape: `{code, message, retryable}`
6. WHEN formats are listed THEN the document SHALL enumerate `skit`, `groupchat`, `prreview`,
   `sketch`, `tierlist` (current), plus `casefile`, `whiteboard`, `pov` (legacy, read-only),
   and SHALL note that Pause & Predict questions in the learning pack have IDs like `pause-3`.
7. WHEN a generated Kotlin client section is included THEN it SHALL give the exact
   `openapi-generator-cli` command against the deployed OpenAPI spec URL and SHALL recommend
   Retrofit/OkHttp, Media3/ExoPlayer and AppAuth.
8. WHEN test user instructions are included THEN they SHALL describe how to add a test user in
   the Cognito console (or AWS CLI) and what is not yet supported.

---

## Req HD-13: README and tasks updates

**User story:** As a contributor, I want the README and task lists updated with live values so
the project status is always accurate.

1. WHEN the deploy is complete THEN `README.md` SHALL have a short "Hosted" section with the
   website URL and `ApiBaseUrl`.
2. WHEN tasks 13 and 14.1 in `.kiro/specs/brainrot/tasks.md` are complete THEN they SHALL be
   ticked `[x]` with a concrete completion note.
3. WHEN the hosted-deploy spec `tasks.md` is updated THEN each completed task SHALL be ticked.
4. WHEN `docs/HANDOFF.md` is updated THEN the contract changes (AndroidClient audience
   expansion) and the new output `CognitoAndroidClientId` SHALL be noted.
