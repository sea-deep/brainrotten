#!/usr/bin/env bash
# Builds the arm64 Lambda runtime image for one commit and pushes it to ECR, unless that commit's
# image already exists. Prints the immutable image URI (repo@sha256:…) as the last line.
# Needs: AWS credentials, Docker, ECR_REPOSITORY (full URI), AWS_REGION. Optional: IMAGE_TAG (default: git SHA).
set -euo pipefail
: "${ECR_REPOSITORY:?set ECR_REPOSITORY to the full ECR repository URI}"
: "${AWS_REGION:?set AWS_REGION}"
TAG="${IMAGE_TAG:-$(git rev-parse HEAD)}"
REPO_NAME="${ECR_REPOSITORY#*/}"
REGISTRY="${ECR_REPOSITORY%%/*}"

digest() { aws ecr describe-images --region "$AWS_REGION" --repository-name "$REPO_NAME" --image-ids "imageTag=$TAG" --query 'imageDetails[0].imageDigest' --output text 2>/dev/null || true; }

existing="$(digest)"
if [[ -n "$existing" && "$existing" != "None" ]]; then
  echo "Image for $TAG already in ECR; reusing it." >&2
else
  aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" >&2
  if docker buildx inspect 2>/dev/null | grep -q 'Driver: *docker-container'; then
    # Layer cache kept in ECR (tag "buildcache"): unchanged dependency layers are reused across builds.
    # Single-platform manifest without attestations, which Lambda requires.
    docker buildx build --platform linux/arm64 -f cloud/Dockerfile -t "$ECR_REPOSITORY:$TAG" \
      --cache-from "type=registry,ref=$ECR_REPOSITORY:buildcache" \
      --cache-to "type=registry,ref=$ECR_REPOSITORY:buildcache,mode=max,image-manifest=true,oci-mediatypes=true" \
      --provenance=false --sbom=false --push . >&2
  else
    docker build --platform linux/arm64 -f cloud/Dockerfile -t "$ECR_REPOSITORY:$TAG" . >&2
    docker push "$ECR_REPOSITORY:$TAG" >&2
  fi
  existing="$(digest)"
fi
[[ "$existing" == sha256:* ]] || { echo "Could not read the pushed image digest." >&2; exit 1; }
echo "$ECR_REPOSITORY@$existing"
