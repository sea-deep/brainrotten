# Brainrotten AWS API

This is the implemented authenticated video service, not a 501 scaffold. It is **not deployed in this workspace**. API Gateway checks Cognito JWTs; the API stores atomic lifetime reservations in DynamoDB and sends SQS jobs; a separate Lambda image worker uses private Secrets Manager keys and uploads private S3 media. The default `EnableHostedTrial=false` closes generation.

Build `apps/cloud/Dockerfile` as linux/amd64 and push to ECR. The Node 26 Debian image includes the Lambda runtime interface client, FFmpeg, fonts, character PNGs and only the supplied gameplay. It excludes local voice recordings/model weights; hosted jobs use ElevenLabs. API/worker handlers are selected using the Lambda image command.

Deploy the website with `infra/site/template.yaml`. It uses private S3 and CloudFront OAC, with known SPA route rewrites and security response headers. No public S3 website endpoint or wildcard CORS origin is used.

Follow [the release commands](../../docs/production/RELEASE.md) and [Google setup](../../docs/GOOGLE-AWS-SETUP.md). Public OpenAPI and health endpoints are exempt from JWT authorization; generation, search, quota and jobs are protected. Google secret ARN dynamic references keep secrets out of shell parameters and SAM config.

Validate using `sam validate --template-file infra/sam/template.yaml --lint`. Run a real sign-in and generation smoke test before describing the stack as deployed or production tested. Lambda timeout, account concurrency, external image availability and provider credits need live verification.
