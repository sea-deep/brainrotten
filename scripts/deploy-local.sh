#!/usr/bin/env bash
# Deploys from this computer with your own AWS login: the same scripts the GitLab pipeline runs, without CI.
#   pnpm deploy:site       build the website and publish it (S3 + CloudFront), copying changed example videos
#   pnpm deploy:backend    build the arm64 runtime image (needs Docker) and deploy the API stack
# Settings are read from the live stacks, so nothing needs to be configured first.
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION="${AWS_REGION:-ap-south-1}" API_STACK="${API_STACK:-brainrotten-api}" SITE_STACK="${SITE_STACK:-brainrotten-site}"
out() { aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }
param() { aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$API_STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text; }
export MEDIA_BUCKET="${MEDIA_BUCKET:-$(out brainrotten-ci MediaBucketName)}"

case "${1:-}" in
  site)
    pnpm build
    scripts/ci/deploy-site.sh
    ;;
  backend)
    docker info >/dev/null 2>&1 || { command -v colima >/dev/null && colima start --arch aarch64 >/dev/null; } || true
    docker info >/dev/null 2>&1 || { echo "Start Docker (Docker Desktop or 'colima start') and run this again." >&2; exit 1; }
    ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
    export ECR_REPOSITORY="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/brainrotten-runtime"
    export CFN_EXECUTION_ROLE_ARN="$(out brainrotten-ci CloudFormationExecutionRoleArn)"
    export COGNITO_DOMAIN_PREFIX="$(param CognitoDomainPrefix)" GOOGLE_CLIENT_ID="$(param GoogleClientId)"
    export GOOGLE_OAUTH_SECRET_ARN="$(param GoogleOAuthSecretArn)" PROVIDER_SECRET_ARN="$(param ProviderSecretArn)" ENABLE_HOSTED_TRIAL="$(param EnableHostedTrial)"
    IMAGE="$(scripts/ci/build-runtime-image.sh | tail -1)"
    scripts/ci/deploy-backend.sh "$IMAGE"
    ;;
  *) echo "Usage: scripts/deploy-local.sh site|backend" >&2; exit 1 ;;
esac
