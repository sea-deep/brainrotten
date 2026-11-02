#!/usr/bin/env bash
# Builds the hosted website and publishes it to the private S3 bucket behind CloudFront.
# Hashed assets are cached for a year; HTML and the example index are revalidated on every visit.
# Needs: AWS credentials, pnpm with dependencies installed, AWS_REGION, SITE_STACK, API_STACK.
set -euo pipefail
for name in AWS_REGION SITE_STACK API_STACK; do [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 1; }; done
# Keep the site stack (bucket, CloudFront, security headers) in step with infra/site/template.yaml.
aws cloudformation deploy --region "$AWS_REGION" --stack-name "$SITE_STACK" --template-file infra/site/template.yaml \
  ${CFN_EXECUTION_ROLE_ARN:+--role-arn "$CFN_EXECUTION_ROLE_ARN"} --no-fail-on-empty-changeset
output() { aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }
SITE_URL="$(output "$SITE_STACK" SiteUrl)"
BUCKET="$(output "$SITE_STACK" SiteBucketName)"
DISTRIBUTION="$(output "$SITE_STACK" DistributionId)"
API="$(output "$API_STACK" ApiBaseUrl)"
[[ "$SITE_URL" == https://* && -n "$BUCKET" && -n "$DISTRIBUTION" && "$API" == https://* ]] || { echo "Stack outputs are missing." >&2; exit 1; }

# One-command MCP installer (versioned npm tarball) plus install.md and llms.txt for agents.
node scripts/build-mcp-package.mjs --api-url "$API" --site-url "$SITE_URL"
VITE_HOSTED=true VITE_EXAMPLES_ONLY=false VITE_API_BASE_URL="$API" VITE_SITE_URL="$SITE_URL" pnpm --filter @brainrot/web build
DIST=apps/web/dist

# Upload new files first, then HTML, then remove stale files: visitors never get HTML that points at missing assets.
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" --region "$AWS_REGION" --cache-control 'public,max-age=31536000,immutable' --only-show-errors
aws s3 sync "$DIST" "s3://$BUCKET" --region "$AWS_REGION" --exclude 'assets/*' --exclude '*.html' --exclude 'examples/index.json' --exclude 'install.md' --exclude 'llms.txt' --exclude 'install/brainrotten-mcp.tgz' --cache-control 'public,max-age=86400' --only-show-errors
aws s3 cp "$DIST/examples/index.json" "s3://$BUCKET/examples/index.json" --region "$AWS_REGION" --cache-control 'no-cache' --content-type application/json --only-show-errors
# Always-fresh agent instructions and the unversioned installer alias.
for file in install.md llms.txt install/brainrotten-mcp.tgz; do
  aws s3 cp "$DIST/$file" "s3://$BUCKET/$file" --region "$AWS_REGION" --cache-control 'no-cache' --only-show-errors
done
aws s3 sync "$DIST" "s3://$BUCKET" --region "$AWS_REGION" --exclude '*' --include '*.html' --cache-control 'no-cache' --content-type 'text/html; charset=utf-8' --only-show-errors
aws s3 sync "$DIST" "s3://$BUCKET" --region "$AWS_REGION" --delete --only-show-errors

INVALIDATION="$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths '/index.html' '/' '/examples/index.json' '/install.md' '/llms.txt' '/install/brainrotten-mcp.tgz' --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$INVALIDATION"

# Smoke test the live routes.
for path in / /studio /mcp /examples/index.json /og.png /install.md /install/brainrotten-mcp.tgz; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE_URL$path")"
  [[ "$code" == 200 ]] || { echo "$SITE_URL$path returned $code" >&2; exit 1; }
done
echo "Site live at $SITE_URL"
