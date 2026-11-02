#!/usr/bin/env bash
# Deploys the API stack (Lambda API + worker, Cognito, queue, tables, media bucket) with one runtime image.
# Usage: scripts/ci/deploy-backend.sh <image-uri@sha256:…>
# Needs: AWS credentials, SAM CLI and these variables (non-secret identifiers only; secrets stay in Secrets Manager):
#   AWS_REGION API_STACK ECR_REPOSITORY CFN_EXECUTION_ROLE_ARN SITE_STACK COGNITO_DOMAIN_PREFIX
#   GOOGLE_CLIENT_ID GOOGLE_OAUTH_SECRET_ARN PROVIDER_SECRET_ARN ENABLE_HOSTED_TRIAL
set -euo pipefail
IMAGE="${1:?pass the image URI with its digest}"
[[ "$IMAGE" == *@sha256:* ]] || { echo "Use an immutable image URI (…@sha256:…)." >&2; exit 1; }
for name in AWS_REGION API_STACK ECR_REPOSITORY CFN_EXECUTION_ROLE_ARN SITE_STACK COGNITO_DOMAIN_PREFIX GOOGLE_CLIENT_ID GOOGLE_OAUTH_SECRET_ARN PROVIDER_SECRET_ARN ENABLE_HOSTED_TRIAL; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 1; }
done
# The website's address is the only origin allowed to sign in and call the API from a browser.
ORIGIN="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$SITE_STACK" --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)"
[[ "$ORIGIN" == https://* ]] || { echo "Deploy the site stack first ($SITE_STACK has no SiteUrl)." >&2; exit 1; }

sam deploy \
  --template-file infra/sam/template.yaml \
  --stack-name "$API_STACK" \
  --region "$AWS_REGION" \
  --resolve-s3 \
  --image-repository "$ECR_REPOSITORY" \
  --role-arn "$CFN_EXECUTION_ROLE_ARN" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --no-confirm-changeset --no-fail-on-empty-changeset --no-progressbar \
  --parameter-overrides \
    "RuntimeImageUri=$IMAGE" \
    "AppOrigin=$ORIGIN" \
    "CognitoDomainPrefix=$COGNITO_DOMAIN_PREFIX" \
    "GoogleClientId=$GOOGLE_CLIENT_ID" \
    "GoogleOAuthSecretArn=$GOOGLE_OAUTH_SECRET_ARN" \
    "ProviderSecretArn=$PROVIDER_SECRET_ARN" \
    "EnableHostedTrial=$ENABLE_HOSTED_TRIAL"

API="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$API_STACK" --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" --output text)"
# Smoke test: the public endpoints answer and protected ones still require sign-in.
for attempt in 1 2 3 4 5 6; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$API/health" || true)"
  [[ "$code" == 200 ]] && break
  sleep 10
done
[[ "$code" == 200 ]] || { echo "Health check failed ($code)." >&2; exit 1; }
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/formats/guide?format=sketch")" == 200 ]] || { echo "Format guide failed." >&2; exit 1; }
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/me")" == 401 ]] || { echo "Protected route answered without sign-in." >&2; exit 1; }
echo "Backend live at $API"
