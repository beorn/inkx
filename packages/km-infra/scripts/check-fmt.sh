#!/usr/bin/env bash
# check-fmt.sh — fail-loud wrapper around `oxfmt --check`.
#
# oxfmt --check exits 0 even when it reports "Format issues found in
# above N files." That silent pass is how the 2026-02-11 printWidth
# bump (80 → 120) accumulated months of holdouts: every `bun fix` only
# reformatted edited files, and CI never tripped because oxfmt's
# check-mode return code was a lie.
#
# This wrapper greps the output for the issues banner and exits 1 if
# anything is dirty, telling the user to run `bun fix` to repair.
#
# Usage: bash packages/km-infra/scripts/check-fmt.sh [paths...]
#   Default paths: apps packages vendor (matches package.json `format`)

set -euo pipefail

paths=("$@")
if [ ${#paths[@]} -eq 0 ]; then
  paths=(apps packages vendor)
fi

# Capture both stdout + stderr so we can scan for the banner regardless
# of which stream oxfmt picks.
output=$(bunx oxfmt --check "${paths[@]}" 2>&1)
echo "$output"

if echo "$output" | grep -qE "Format issues found"; then
  echo
  echo "::error:: oxfmt --check found formatting drift in: ${paths[*]}"
  echo "::error:: Run 'bun fix' to repair, then commit the result."
  exit 1
fi
