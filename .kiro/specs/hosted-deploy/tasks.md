# Tasks: Hosted Deploy + Android Integration

Spec revision: 2026-11-01. Each task maps to a requirement in `requirements.md`.
Confirm region (default: ap-south-1) before starting T-1.

---

## Phase 0 — Template + code changes (no AWS)

- [x] T-0.1  Add `AndroidClient` resource to `infra/sam/template.yaml` (Req HD-5.1)
- [x] T-0.2  Update JWT authorizer audience to include `AndroidClient` literally (Req HD-5.3)
- [x] T-0.3  Add `COGNITO_ANDROID_CLIENT_ID` to `Globals.Function.Environment.Variables` (Req HD-5.4)
- [x] T-0.4  Add `CognitoAndroidClientId` output to `infra/sam/template.yaml` (Req HD-5.2)
- [x] T-0.5  Add `COGNITO_ANDROID_CLIENT_ID` to `authenticatedSubject` allow-set in `cloud/src/api.ts` (Req HD-5.4)
- [x] T-0.6  Update `cloud/src/api.test.ts` (or equivalent) to cover `AndroidClient` accepted / not blocked on learner-writes (Req HD-5.7) — added 3 tests to `cloud/src/review.test.ts`
- [x] T-0.7  Run `sam validate --lint` and confirm it passes (Req HD-5.6)
- [x] T-0.8  Run `pnpm check` and confirm it passes (Req HD-1.1) — 30 cloud + 100 companion tests green

---

## Phase 1 — Preflight (read-only AWS)

- [x] T-1.1  Confirm AWS CLI v2 installed — v2.39.3 ✓
- [x] T-1.2  Confirm SAM CLI installed — 1.171.0 ✓
- [x] T-1.3  Confirm Docker daemon running ✓
- [x] T-1.4  Region ap-south-1 confirmed ✓
- [x] T-1.5  `aws sts get-caller-identity` — Account 047719634533 (root; proceeding with user consent) ✓
- [x] T-1.6  `node scripts/release-preflight.mjs --aws` — all OK ✓

---

## Phase 2 — Site stack  ⚠️ Creates AWS resources — ask user first

- [ ] T-2.1  Ask user to confirm before running `aws cloudformation deploy` for site stack
- [ ] T-2.2  Deploy `infra/site/template.yaml` as `brainrotten-site` (Req HD-2.1)
- [ ] T-2.3  Record `SiteUrl`, `SiteBucketName`, `DistributionId` from stack outputs (Req HD-2.1)
- [ ] T-2.4  Verify HTTPS redirect and router function with `curl -I {SiteUrl}` (Req HD-2.2)

---

## Phase 3 — Google OAuth  ⚠️ Requires browser — stop and give instructions

- [ ] T-3.1  Compute `GoogleRedirectUri` = `https://{CognitoDomainPrefix}.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse`; tell user the exact value
- [ ] T-3.2  Give user step-by-step instructions for Google Cloud Console (Req HD-3.1):
             - Open https://console.cloud.google.com
             - Select/create project → APIs & Services → OAuth consent screen
             - Audience: External; add test users
             - Create Web OAuth client
             - Authorized redirect URI: the exact `GoogleRedirectUri` from T-3.1
             - Copy `client_id` and `client_secret`
- [ ] T-3.3  Wait for user to confirm they have `client_id` and `client_secret`
- [ ] T-3.4  Ask user before creating the Secrets Manager secret (Req HD-3.2) ⚠️
- [ ] T-3.5  Create `brainrotten/google` secret in Secrets Manager; record its ARN (Req HD-3.2)

---

## Phase 4 — Provider secret  ⚠️ Creates AWS resources — ask user first

- [ ] T-4.1  Ask user before running export + Secrets Manager create
- [ ] T-4.2  Run `node scripts/export-provider-secret.mjs $HOME/.local/share/brainrot/deploy/providers.json` (Req HD-4.1)
- [ ] T-4.3  Ask user before creating/updating `brainrotten/providers` secret in Secrets Manager ⚠️
- [ ] T-4.4  Create/update `brainrotten/providers`; record its ARN (Req HD-4.2)
- [ ] T-4.5  Confirm upload succeeded, then delete temp file `$HOME/.local/share/brainrot/deploy/providers.json` (Req HD-4.2)

---

## Phase 5 — Build and push Lambda image  ⚠️ ECR push, costs bandwidth — ask user first

- [ ] T-5.1  Ask user before ECR create-repository and Docker push
- [ ] T-5.2  Set `AWS_ACCOUNT_ID`, `ECR_REGISTRY`, `RUNTIME_IMAGE` variables (Req HD-6.1)
- [ ] T-5.3  Run `aws ecr create-repository --repository-name brainrotten-runtime` (skip if exists) ⚠️
- [ ] T-5.4  Run ECR login and `docker buildx build … --push` (Req HD-6.1) ⚠️
- [ ] T-5.5  Record the pushed image digest (use `@sha256:…` in deploy for reproducibility)

---

## Phase 6 — API stack deploy (trial off)  ⚠️ Creates AWS resources — ask user first

- [ ] T-6.1  Ask user before running `sam deploy` for the API stack
- [ ] T-6.2  Set all parameter variables: `SITE_ORIGIN`, `COGNITO_PREFIX`, `GOOGLE_CLIENT_ID`,
             `GOOGLE_SECRET_ARN`, `PROVIDER_SECRET_ARN`, `RUNTIME_IMAGE`
- [ ] T-6.3  Run `sam validate --lint` — must pass (Req HD-6.6)
- [ ] T-6.4  Run `sam deploy … EnableHostedTrial=false` (Req HD-6.1) ⚠️
- [ ] T-6.5  Record all stack outputs (Req HD-6.7)
- [ ] T-6.6  Verify `GET /api/v1/health` returns `{"hostedEnabled":false}` (Req HD-6.2)
- [ ] T-6.7  Verify `GET /api/v1/studio/config` returns config with no secrets (Req HD-6.3)
- [ ] T-6.8  Verify `GET /api/v1/openapi.json` returns the spec (Req HD-6.4)
- [ ] T-6.9  Verify unauthenticated call to `/api/v1/me` returns 401 (Req HD-6.5)

---

## Phase 7 — Website deployment  ⚠️ S3 sync + CloudFront invalidation — ask user first

- [ ] T-7.1  Ask user before running S3 sync and CloudFront invalidation
- [ ] T-7.2  Set `VITE_HOSTED=true`, `VITE_API_BASE_URL` from stack output, then run `pnpm build` (Req HD-7.1)
- [ ] T-7.3  Sync `apps/web/dist/` to `SiteBucketName` with `--delete` (Req HD-7.2) ⚠️
- [ ] T-7.4  Run `aws cloudfront create-invalidation --distribution-id … --paths '/*'` ⚠️
- [ ] T-7.5  Open `SiteUrl` in browser — Studio should load; check `/api/v1/health` from Network tab (Req HD-7.4)

---

## Phase 8 — Google sign-in verification

- [ ] T-8.1  Give user exact instructions to add a test user in the Google OAuth consent screen
- [ ] T-8.2  Wait for user to attempt Google sign-in on the live site
- [ ] T-8.3  Confirm callback lands on `/studio` (Req HD-8.1)
- [ ] T-8.4  Confirm `GET /api/v1/me` returns subject, email, `quotaRemaining: 5` (Req HD-8.2)
- [ ] T-8.5  Confirm invalid token returns 401 (Req HD-8.3)

---

## Phase 9 — Enable hosted trial  ⚠️ Enables paid generation — explicit confirm required

- [ ] T-9.1  **Describe cost impact to user and wait for explicit OK** (Req HD-9.1)
- [ ] T-9.2  Ask user before re-running `sam deploy … EnableHostedTrial=true` ⚠️
- [ ] T-9.3  Run `sam deploy … EnableHostedTrial=true` (Req HD-9.2)
- [ ] T-9.4  Verify `GET /api/v1/health` returns `{"hostedEnabled":true}` (Req HD-9.2)
- [ ] T-9.5  Verify `GET /api/v1/studio/config` shows `auth.configured: true` (Req HD-9.3)

---

## Phase 10 — End-to-end video verification  ⚠️ Uses one quota slot and speech credits

- [ ] T-10.1  Ask user before submitting the hosted video
- [ ] T-10.2  Submit one video; confirm quota drops from 5 → 4 (Req HD-10.1)
- [ ] T-10.3  Poll job to `ready`; confirm signed URLs and learning pack (Req HD-10.2)
- [ ] T-10.4  Re-submit same `requestId`; confirm same `jobId` returned (Req HD-10.3)
- [ ] T-10.5  Submit changed payload with same `requestId`; confirm 409 (Req HD-10.4)
- [ ] T-10.6  Sign in as a second test account; confirm first account's jobs return 404 (Req HD-10.5)
- [ ] T-10.7  With a test account at 5/5, submit a sixth; confirm 402 `QUOTA_EXCEEDED` (Req HD-10.6)
- [ ] T-10.8  Check `mediaExpiresAt` on the job; verify URL expiry logic (Req HD-10.7)
- [ ] T-10.9  Fetch learning pack URL; confirm `LearningPackV1` JSON with flashcards (Req HD-10.8)

---

## Phase 11 — MCP account connection

- [ ] T-11.1  Run `pnpm brainrotten login --api-url <ApiBaseUrl>` (Req HD-11.1)
- [ ] T-11.2  Run `pnpm brainrotten mcp --account` (Req HD-11.2)
- [ ] T-11.3  Make one MCP tool call; confirm job appears in hosted library (Req HD-11.3)

---

## Phase 12 — Handoff documents and README

- [ ] T-12.1  Write `ANDROID-INTEGRATION.md` at repository root with all real values (Req HD-12)
- [ ] T-12.2  Add "Hosted" section to `README.md` with site URL and `ApiBaseUrl` (Req HD-13.1)
- [ ] T-12.3  Tick tasks 13.1, 13.2, 13.3 and 14.1 in `.kiro/specs/brainrot/tasks.md` (Req HD-13.2)
- [ ] T-12.4  Update `docs/HANDOFF.md` with `CognitoAndroidClientId` output and allowlist change (Req HD-13.4)

---

## Phase 13 — Commit and PR

- [ ] T-13.1  Confirm `pnpm check` passes on the final state
- [ ] T-13.2  Stage specific files (no `git add .`); confirm no `.env`, keys, or data/ content
- [ ] T-13.3  Ask user before creating the commit and pushing a new branch
- [ ] T-13.4  Create commit: `feat(cloud): hosted deploy, AndroidClient, Android integration handoff`
- [ ] T-13.5  Push new branch; ask user before opening PR
