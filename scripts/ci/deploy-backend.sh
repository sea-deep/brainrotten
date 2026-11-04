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

# Alarm emails: ALERT_EMAIL sets or changes the subscribed address; without it the live value is kept.
LIVE_ALERT_EMAIL="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$API_STACK" --query "Stacks[0].Parameters[?ParameterKey=='AlertEmail'].ParameterValue | [0]" --output text 2>/dev/null || true)"
[[ "$LIVE_ALERT_EMAIL" == "None" ]] && LIVE_ALERT_EMAIL=""
ALERT_EMAIL="${ALERT_EMAIL:-$LIVE_ALERT_EMAIL}"
ALERT_PARAM=();[[ -n "$ALERT_EMAIL" ]] && ALERT_PARAM=("AlertEmail=$ALERT_EMAIL")   # SAM rejects an empty value; the default is no email

# Fast path: when the template and every setting except the image are already live, swap the image on the two
# Lambda functions directly (about 20 seconds) instead of a full CloudFormation update (about 2 minutes).
TEMPLATE_SHA="$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync("infra/sam/template.yaml")).digest("hex").slice(0,16))')"
fast_path() {
  [[ "${FORCE_FULL_DEPLOY:-}" == "1" ]] && return 1
  # Every full deploy tags the stack with a fingerprint of the template it applied.
  local live
  live="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$API_STACK" --query "Stacks[0].Tags[?Key=='TemplateSha'].Value | [0]" --output text 2>/dev/null)" || return 1
  [[ "$live" == "$TEMPLATE_SHA" ]] || { echo "Template changed: full deploy." >&2; return 1; }
  local expected="AppOrigin=$ORIGIN CognitoDomainPrefix=$COGNITO_DOMAIN_PREFIX GoogleClientId=$GOOGLE_CLIENT_ID GoogleOAuthSecretArn=$GOOGLE_OAUTH_SECRET_ARN ProviderSecretArn=$PROVIDER_SECRET_ARN EnableHostedTrial=$ENABLE_HOSTED_TRIAL AlertEmail=$ALERT_EMAIL"
  local actual
  actual="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$API_STACK" --query 'Stacks[0].Parameters' --output json | node -e '
    const params=JSON.parse(require("fs").readFileSync(0,"utf8")),value=k=>(params.find(p=>p.ParameterKey===k)||{}).ParameterValue;
    console.log(["AppOrigin","CognitoDomainPrefix","GoogleClientId","GoogleOAuthSecretArn","ProviderSecretArn","EnableHostedTrial","AlertEmail"].map(k=>k+"="+(value(k)??"")).join(" "));')"
  [[ "$actual" == "$expected" ]] || { echo "Settings changed: full deploy." >&2; return 1; }
  for logical in ApiFunction Worker; do
    local name
    name="$(aws cloudformation describe-stack-resource --region "$AWS_REGION" --stack-name "$API_STACK" --logical-resource-id "$logical" --query 'StackResourceDetail.PhysicalResourceId' --output text)" || return 1
    aws lambda update-function-code --region "$AWS_REGION" --function-name "$name" --image-uri "$IMAGE" --query 'LastUpdateStatus' --output text >/dev/null || return 1
    aws lambda wait function-updated-v2 --region "$AWS_REGION" --function-name "$name" || return 1
    echo "Updated $logical ($name) to $IMAGE" >&2
  done
}

if fast_path; then echo "Code-only change: updated the Lambda images directly." >&2; else
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
    "EnableHostedTrial=$ENABLE_HOSTED_TRIAL" \
    ${ALERT_PARAM[@]+"${ALERT_PARAM[@]}"} \
  --tags "TemplateSha=$TEMPLATE_SHA"
fi

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
