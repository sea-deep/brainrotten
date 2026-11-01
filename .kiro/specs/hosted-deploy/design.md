# Design: Hosted Deploy + Android Integration

Spec revision: 2026-11-01. Region: ap-south-1 (confirm before first deploy).

---

## Architecture overview

```
                    ┌─────────────────────────────────────────────────┐
                    │  CloudFront (PriceClass_100, HTTP/2+3, OAC)     │
                    │  ResponseHeadersPolicy: CSP, HSTS, X-Frame, ... │
                    │  Router function: known routes → index.html      │
                    └────────────────┬────────────────────────────────┘
                                     │ HTTPS origin
                    ┌────────────────▼────────────────────────────────┐
                    │  S3 SiteBucket (private, AES-256, OAC only)     │
                    │  Vite SPA: VITE_HOSTED=true + VITE_API_BASE_URL │
                    └─────────────────────────────────────────────────┘

Browser / Android / MCP agent
      │  Authorization: Bearer <Cognito access token>
      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  API Gateway HTTP API (StageName: $default)                          │
│  Throttle: 5 req/s, burst 20                                         │
│  CORS: AllowOrigins=[AppOrigin], methods GET/POST/PUT/OPTIONS         │
│  Public routes: /health, /openapi.json, /studio/config               │
│  JWT authorizer (CognitoJwt):                                        │
│    issuer: https://cognito-idp.ap-south-1.amazonaws.com/{UserPoolId} │
│    audience: [WebClientId, AgentClientId, AndroidClientId]           │
└───────────────┬──────────────────────────────────────────────────────┘
                │ Lambda proxy (all routes)
┌───────────────▼──────────────────────────────────────────────────────┐
│  ApiFunction (Node 26, x86_64, 512 MB, 30 s, concurrency 10)        │
│  Image: ECR brainrotten-runtime:release-<tag>  Command: api.handler  │
│  - authenticatedSubject(): validates iss / client_id allow-set /     │
│    token_use=access → returns Cognito subject                        │
│  - Routes: sessions, videos, library, reviews, image search, me      │
│  - media(): generates 1-hour presigned S3 URLs per request           │
│  Env: DYNAMODB_TABLE, S3_BUCKET, JOB_QUEUE_URL, HOSTED_ENABLED,     │
│       COGNITO_ISSUER, COGNITO_CLIENT_ID, COGNITO_AGENT_CLIENT_ID,   │
│       COGNITO_ANDROID_CLIENT_ID (new), COGNITO_ADDITIONAL_CLIENT_IDS │
└───────┬───────────────────────────────┬──────────────────────────────┘
        │ DynamoDB CRUD                  │ SQS SendMessage
        ▼                                ▼
┌───────────────┐          ┌─────────────────────────────────────────┐
│  JobsTable    │          │  VideoQueue (SQS, SseEnabled, DLQ x3)  │
│  (PAY_PER_REQ │          └──────────────────┬──────────────────────┘
│   SSE, PITR,  │                             │ trigger (BatchSize=1)
│   Retain)     │          ┌──────────────────▼──────────────────────┐
└───────────────┘          │  Worker (Node 26, x86_64, 4096 MB,      │
                           │  900 s, ephemeral 2048 MB, concurrency 2)│
                           │  Image: same ECR  Command: worker.handler│
                           │  - Reads PROVIDER_SECRET_ARN from SM     │
                           │  - ElevenLabs speech → FFmpeg → S3       │
                           └──────────────────┬──────────────────────┘
                                              │ S3 CRUD
                           ┌──────────────────▼──────────────────────┐
                           │  MediaBucket (private, AES-256,          │
                           │   CORS for AppOrigin, Lifecycle 30 days) │
                           └─────────────────────────────────────────┘

Identity (Cognito ap-south-1):
  UserPool ──► GoogleProvider (Google OAuth 2.0 OIDC)
           ──► WebClient      (code+PKCE, callback AppOrigin/auth/callback)
           ──► AgentClient    (code+PKCE, callback localhost:43891)  [agent, no learner-writes]
           ──► AndroidClient  (code+PKCE, callback brainrotgram://auth/callback) [new]
           ──► UserPoolDomain (CognitoDomainPrefix.auth.ap-south-1.amazoncognito.com)

Secrets Manager:
  brainrotten/google    → {client_id, client_secret}  (GoogleOAuthSecretArn)
  brainrotten/providers → {project keys, CHARACTER_VOICES_JSON}  (ProviderSecretArn)
```

---

## SAM template changes for AndroidClient

### New resource: `AndroidClient`

Add after `AgentClient` in `infra/sam/template.yaml`:

```yaml
AndroidClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    UserPoolId: !Ref UserPool
    GenerateSecret: false
    SupportedIdentityProviders: !If [HasGoogle, [!Ref GoogleProvider], [COGNITO]]
    AllowedOAuthFlowsUserPoolClient: true
    AllowedOAuthFlows: [code]
    AllowedOAuthScopes: [openid, email, profile]
    CallbackURLs: ['brainrotgram://auth/callback']
    LogoutURLs: ['brainrotgram://auth/signout']
    AccessTokenValidity: 1
    RefreshTokenValidity: 30
    TokenValidityUnits:
      AccessToken: hours
      RefreshToken: days
    EnableTokenRevocation: true
    PreventUserExistenceErrors: ENABLED
```

### JWT authorizer audience update

The audience list currently uses an `!If [HasAdditionalClients, ...]` split. Replace it with a
literal three-client list so `AndroidClient` is always included without needing `AdditionalClientIds`:

```yaml
audience:
  - !Ref WebClient
  - !Ref AgentClient
  - !Ref AndroidClient
```

Remove the `HasAdditionalClients` condition and the `AdditionalClientIds` parameter if they are no
longer needed by any other resource. If they are kept for future extensibility, update the audience
to also include `AndroidClient` unconditionally.

### Lambda environment variable

Add to `Globals.Function.Environment.Variables`:

```yaml
COGNITO_ANDROID_CLIENT_ID: !Ref AndroidClient
```

### New output

```yaml
CognitoAndroidClientId:
  Value: !Ref AndroidClient
```

---

## `cloud/src/api.ts` client allowlist change

`authenticatedSubject` currently builds the allow-set from `COGNITO_CLIENT_ID`,
`COGNITO_AGENT_CLIENT_ID`, and `COGNITO_ADDITIONAL_CLIENT_IDS`. Add `COGNITO_ANDROID_CLIENT_ID`:

```typescript
const clients = new Set([
  primary,
  process.env['COGNITO_AGENT_CLIENT_ID'],
  process.env['COGNITO_ANDROID_CLIENT_ID'],   // new
  ...(process.env['COGNITO_ADDITIONAL_CLIENT_IDS'] ?? '')
    .split(',').map(id => id.trim()).filter(id => /^[a-z0-9]{10,128}$/.test(id)),
]);
```

The learner-write block only checks `COGNITO_AGENT_CLIENT_ID`:

```typescript
if (
  process.env['COGNITO_AGENT_CLIENT_ID'] &&
  claims['client_id'] === process.env['COGNITO_AGENT_CLIENT_ID']
) return reply(403, { message: 'Learning responses belong to the learner...' });
```

This means `AndroidClient` is implicitly allowed for learner writes, which is correct (it is
a first-party user-facing client). No additional change needed for the learner-write path.

---

## Parameters and outputs (full list after change)

### Parameters

| Parameter | Type | Notes |
|---|---|---|
| `RuntimeImageUri` | String | ECR URI `account.dkr.ecr.region.amazonaws.com/brainrotten-runtime:tag` |
| `AppOrigin` | String | CloudFront `SiteUrl`, no trailing slash |
| `CognitoDomainPrefix` | String | Globally unique; used in Cognito hosted-UI domain |
| `GoogleClientId` | String | Public; from Google Cloud Console |
| `GoogleOAuthSecretArn` | String | ARN of `brainrotten/google` secret |
| `ProviderSecretArn` | String | ARN of `brainrotten/providers` secret |
| `AdditionalClientIds` | CommaDelimitedList | Optional; kept for future extensibility |
| `EnableHostedTrial` | `true`/`false` | Default `false`; set `true` only after verification |

### Outputs (updated)

| Output | Description |
|---|---|
| `ApiBaseUrl` | `https://{ApiId}.execute-api.ap-south-1.amazonaws.com/api/v1` |
| `GoogleRedirectUri` | Exact redirect URI to paste in Google Cloud Console |
| `CognitoClientId` | WebClient — Studio web app |
| `CognitoAgentClientId` | AgentClient — `pnpm brainrotten login` |
| `CognitoAndroidClientId` | AndroidClient — BrainRotGram **(new)** |
| `CognitoUserPoolId` | Raw user pool ID, e.g. `ap-south-1_Xxxxxxxx` |
| `CognitoDomain` | Hosted-UI base URL, e.g. `https://brainrotten-xyz.auth.ap-south-1.amazoncognito.com` |
| `TrialEnabled` | `true` / `false` (reflects deploy-time condition) |
| `JobsTableName` | DynamoDB table name |
| `MediaBucketName` | S3 media bucket name |
| `QueueUrl` | SQS queue URL |

---

## Android authorization-code + PKCE flow

```
BrainRotGram app
  │
  │  1. Generate code_verifier (random 32-byte, base64url)
  │     code_challenge = BASE64URL(SHA256(code_verifier))
  │
  │  2. Open custom-tab (Chrome Custom Tabs / AppAuth-Android):
  │     GET https://{CognitoDomain}/oauth2/authorize
  │       ?response_type=code
  │       &client_id={CognitoAndroidClientId}
  │       &redirect_uri=brainrotgram://auth/callback
  │       &scope=openid+email+profile
  │       &code_challenge={code_challenge}
  │       &code_challenge_method=S256
  │       &state={random nonce}
  │
  │  3. Cognito → Google → Cognito hosted UI → redirect to
  │     brainrotgram://auth/callback?code=...&state=...
  │
  │  4. App intercepts intent, verifies state, then:
  │     POST https://{CognitoDomain}/oauth2/token
  │       grant_type=authorization_code
  │       code={code}
  │       redirect_uri=brainrotgram://auth/callback
  │       client_id={CognitoAndroidClientId}
  │       code_verifier={code_verifier}
  │     → {access_token, id_token, refresh_token, expires_in}
  │
  │  5. Store access_token + refresh_token in Android EncryptedSharedPreferences
  │     (never in SharedPreferences or logs)
  │
  │  6. All API calls: Authorization: Bearer {access_token}
  │     Never send the id_token to the API.
  │
  │  7. On 401 / token expiry:
  │     POST https://{CognitoDomain}/oauth2/token
  │       grant_type=refresh_token
  │       refresh_token={refresh_token}
  │       client_id={CognitoAndroidClientId}
  │     → new {access_token, expires_in}  (refresh_token rotates)
  │
  │  8. Sign out:
  │     GET https://{CognitoDomain}/logout
  │       ?client_id={CognitoAndroidClientId}
  │       &logout_uri=brainrotgram://auth/signout
  │     Then clear stored tokens.
```

Recommended library: **AppAuth-Android** (`net.openid:appauth:0.11.1`). It handles PKCE,
custom-tab launch, intent interception and token refresh without manual OAuth plumbing.

---

## Rollback procedures

| Scenario | Action |
|---|---|
| Revert to previous site version | Re-run Step 5 with the previous `apps/web/dist` artifact, then invalidate CloudFront `/*` |
| Disable paid generation | `sam deploy … EnableHostedTrial=false`; existing media is private but accessible via signed URLs until 30-day expiry |
| Revert Lambda to previous image | `sam deploy … RuntimeImageUri=<previous-digest>`; DynamoDB data is unaffected |
| Full API stack removal | `aws cloudformation delete-stack --stack-name brainrotten-api`; **DeletionPolicy: Retain** keeps JobsTable, MediaBucket and UserPool — storage costs continue |
| Full site stack removal | `aws cloudformation delete-stack --stack-name brainrotten-site`; SiteBucket retained |
| Rotate Google secret | Update secret in Secrets Manager, then `sam deploy` with same ARN; Cognito picks up new value at next deploy |
| Rotate provider secret | `aws secretsmanager put-secret-value --secret-id <ProviderSecretArn> --secret-string file://…`; worker picks it up on next cold start |

---

## Idle cost estimate (ap-south-1, no traffic)

| Resource | Idle / month |
|---|---|
| CloudFront (PriceClass_100) | ~$0 (1 TB free tier / month) |
| S3 SiteBucket | ~$0.02 (< 1 GB) |
| S3 MediaBucket | ~$0.02 (< 1 GB until 30-day expiry) |
| DynamoDB (PAY_PER_REQUEST, 0 ops) | ~$0 |
| SQS (0 messages) | ~$0 |
| Lambda (0 invocations) | ~$0 |
| API Gateway HTTP API (0 requests) | ~$0 |
| Cognito (0 MAU) | ~$0 |
| Secrets Manager (2 secrets) | ~$0.80 |
| CloudWatch Logs (7-day retention) | ~$0.50 |
| **Estimated idle total** | **~$1.35 / month** |

Each hosted video generation (ElevenLabs speech + ECR pull + Lambda 900 s at 4096 MB):
roughly $0.06 per video in Lambda compute + ElevenLabs API cost (variable by character count).

---

## Security notes

- `AndroidClient` has no client secret. PKCE + custom URI scheme (`brainrotgram://`) prevents
  redirect hijacking. Custom URI schemes are not pre-verified by OS; use AppAuth with
  exact intent filter matching.
- Access tokens last 1 hour. The app must refresh silently before expiry; do not prompt the
  user unless the refresh token is also expired (30 days).
- Store tokens in Android `EncryptedSharedPreferences` backed by the Android Keystore.
- The API's `authenticatedSubject` validates `iss`, `client_id`, and `token_use=access`.
  ID tokens are explicitly rejected — the API only accepts access tokens.
- `AndroidClient` is accepted for learner-write routes (session review PUT). It is NOT blocked
  by the agent-client guard. This is intentional: users write their own predictions and reflections.
- All media is in a private S3 bucket. Presigned URLs are subject-scoped (path includes `sub/`).
  A second user cannot guess or construct another user's media URL.
