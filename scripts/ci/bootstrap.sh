#!/usr/bin/env bash
# One-time setup for the deploy pipeline. Run it yourself with AWS admin credentials and a glab login:
#   1. creates the keyless GitLab → AWS deploy role and the private media bucket (infra/ci/template.yaml, stack brainrotten-ci),
#   2. protects the main branch (only protected-branch pipelines can assume the deploy role),
#   3. sets the CI/CD variables .gitlab-ci.yml reads, copied from the live API stack's settings.
# Nothing secret is stored in GitLab: only role ARNs, bucket and stack names and Secrets Manager ARNs.
set -euo pipefail
PROJECT="${PROJECT:-wdipak/brainrotten}"
REGION="${AWS_REGION:-ap-south-1}"
API_STACK="${API_STACK:-brainrotten-api}"
SITE_STACK="${SITE_STACK:-brainrotten-site}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ENCODED="${PROJECT//\//%2F}"

aws cloudformation deploy --region "$REGION" --stack-name brainrotten-ci --template-file infra/ci/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "GitLabProjectPath=$PROJECT"
ci() { aws cloudformation describe-stacks --region "$REGION" --stack-name brainrotten-ci --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
param() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$API_STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text; }

# main must be protected: the deploy role trusts only tokens for project_path:$PROJECT:ref_type:branch:ref:main,
# and protected variables are only given to protected branches.
glab api "projects/$ENCODED/protected_branches/main" >/dev/null 2>&1 \
  || glab api -X POST "projects/$ENCODED/protected_branches" -f name=main -f push_access_level=40 -f merge_access_level=40 >/dev/null

set_var() {
  glab api -X DELETE "projects/$ENCODED/variables/$1" >/dev/null 2>&1 || true
  glab api -X POST "projects/$ENCODED/variables" -f key="$1" -f value="$2" -f protected=true -f masked=false >/dev/null
  echo "  $1"
}
echo "CI/CD variables:"
set_var AWS_REGION "$REGION"
set_var AWS_DEPLOY_ROLE_ARN "$(ci DeployRoleArn)"
set_var CFN_EXECUTION_ROLE_ARN "$(ci CloudFormationExecutionRoleArn)"
set_var MEDIA_BUCKET "$(ci MediaBucketName)"
set_var ECR_REPOSITORY "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/brainrotten-runtime"
set_var API_STACK "$API_STACK"
set_var SITE_STACK "$SITE_STACK"
set_var COGNITO_DOMAIN_PREFIX "$(param CognitoDomainPrefix)"
set_var GOOGLE_CLIENT_ID "$(param GoogleClientId)"
set_var GOOGLE_OAUTH_SECRET_ARN "$(param GoogleOAuthSecretArn)"
set_var PROVIDER_SECRET_ARN "$(param ProviderSecretArn)"
set_var ENABLE_HOSTED_TRIAL "$(param EnableHostedTrial)"
echo "Done. Pushes to main now deploy the website; run the manual deploy-backend job in a main pipeline to ship backend changes."
