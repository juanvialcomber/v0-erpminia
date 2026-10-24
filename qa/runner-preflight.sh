#!/usr/bin/env bash
set -euo pipefail

fail=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf 'PASS  %s\n' "$label"
  else
    printf 'HOLD  %s\n' "$label"
    fail=1
  fi
}

echo "N3uralia runner preflight"
echo "Host: $(hostname)"
echo "Kernel: $(uname -srm)"

check "Linux" sh -c '[ "$(uname -s)" = "Linux" ]'
check "git" command -v git
check "make" command -v make
check "node" command -v node
check "npm" command -v npm
check "docker" command -v docker
check "docker daemon" docker info
check "curl" command -v curl
check "gitleaks" command -v gitleaks
check "semgrep" command -v semgrep

if command -v pnpm >/dev/null 2>&1; then
  echo "PASS  pnpm"
else
  echo "INFO  pnpm not installed globally; repos using npm remain unaffected"
fi

if command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v google-chrome >/dev/null 2>&1; then
  echo "PASS  Chromium/Chrome"
else
  echo "INFO  Browser binary not found globally; Playwright may install a pinned browser per repo"
fi

avail_kb=$(df -Pk . | awk 'NR==2 {print $4}')
if [ "${avail_kb:-0}" -ge 10485760 ]; then
  echo "PASS  disk >= 10 GB free"
else
  echo "HOLD  disk < 10 GB free"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "Runner preflight: HOLD"
  exit 1
fi

echo "Runner preflight: PASS"
