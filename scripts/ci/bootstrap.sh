#!/usr/bin/env bash
# One-time setup for the deploy pipeline. Run it yourself with AWS admin credentials and a gh login:
#   1. creates the keyless GitHub → AWS deploy role (infra/ci/template.yaml, stack brainrotten-ci),
#   2. creates the "site" and "backend" GitHub environments, limited to the main branch,
#   3. sets the repository variables the workflows read, copied from the live API stack's settings.
# Nothing secret is stored in GitHub: only role ARNs, stack names and Secrets Manager ARNs.
set -euo pipefail
REPO="${REPO:-sea-deep/brainrotten}"
REGION="${AWS_REGION:-ap-south-1}"
API_STACK="${API_STACK:-brainrotten-api}"
SITE_STACK="${SITE_STACK:-brainrotten-site}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

provider="$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?ends_with(Arn,'token.actions.githubusercontent.com')].Arn" --output text)"
aws cloudformation deploy --region "$REGION" --stack-name brainrotten-ci --template-file infra/ci/template.yaml \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "GitHubRepository=$REPO" "CreateOidcProvider=$([[ -n "$provider" ]] && echo false || echo true)"
ci() { aws cloudformation describe-stacks --region "$REGION" --stack-name brainrotten-ci --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
param() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$API_STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text; }

for env in site backend; do
  gh api -X PUT "repos/$REPO/environments/$env" --input - >/dev/null <<<'{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
  gh api "repos/$REPO/environments/$env/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main \
    || gh api -X POST "repos/$REPO/environments/$env/deployment-branch-policies" -f name=main -f type=branch >/dev/null
done

set_var() { gh variable set "$1" --repo "$REPO" --body "$2" >/dev/null; echo "  $1"; }
echo "Repository variables:"
set_var AWS_REGION "$REGION"
set_var AWS_DEPLOY_ROLE_ARN "$(ci DeployRoleArn)"
set_var CFN_EXECUTION_ROLE_ARN "$(ci CloudFormationExecutionRoleArn)"
set_var ECR_REPOSITORY "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/brainrotten-runtime"
set_var API_STACK "$API_STACK"
set_var SITE_STACK "$SITE_STACK"
set_var COGNITO_DOMAIN_PREFIX "$(param CognitoDomainPrefix)"
set_var GOOGLE_CLIENT_ID "$(param GoogleClientId)"
set_var GOOGLE_OAUTH_SECRET_ARN "$(param GoogleOAuthSecretArn)"
set_var PROVIDER_SECRET_ARN "$(param ProviderSecretArn)"
set_var ENABLE_HOSTED_TRIAL "$(param EnableHostedTrial)"
echo "Done. Pushes to main now deploy the website; run Actions → Deploy backend to ship backend changes."
