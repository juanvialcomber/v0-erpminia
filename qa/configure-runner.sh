#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_URL:?Set RUNNER_URL, e.g. https://github.com/owner/repo}"
: "${RUNNER_TOKEN:?Set a short-lived GitHub runner registration token}"

RUNNER_NAME="${RUNNER_NAME:-n3uralia-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-n3uralia,linux,x64}"

if [ ! -x ./config.sh ]; then
  echo "Run this script from an extracted GitHub Actions runner directory."
  exit 2
fi

./config.sh \
  --url "$RUNNER_URL" \
  --token "$RUNNER_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --unattended \
  --replace \
  --ephemeral

echo "Runner configured. Start with: ./run.sh"
