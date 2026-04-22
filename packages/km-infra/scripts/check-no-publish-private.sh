#!/usr/bin/env bash
# Guard: @km/storage and @km/fs-mount must stay private until the source-level
# package cycle between them is resolved (option c — extract @km/runtime).
#
# Context: @km/storage source imports from @km/fs-mount in ~10 files without
# declaring the dep; @km/fs-mount declares @km/storage. Works via Bun workspace
# hoisting, breaks outside the monorepo. Publishing either half would ship a
# broken install to npm consumers.
#
# This script fails if either package.json loses "private": true.
# Wired into `bun run test:ci`. Also enforced at test time by
# packages/km-infra/tests/no-publish-private.test.ts.
#
# When the cycle is resolved (see hub/km/storage-architecture.md §6.6),
# delete this script, delete the vitest test, and remove the call site from
# package.json → scripts → test:ci.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

EXIT=0

check_private() {
  local pkg_name="$1"
  local pkg_path="$REPO_ROOT/packages/$pkg_name/package.json"

  if [ ! -f "$pkg_path" ]; then
    echo "ERROR: expected $pkg_path to exist"
    EXIT=1
    return
  fi

  # Use node to parse JSON robustly (not grep — JSON key order is not guaranteed)
  local is_private
  is_private=$(node -e "const pkg = require('$pkg_path'); console.log(pkg.private === true ? 'true' : 'false')")

  if [ "$is_private" != "true" ]; then
    echo "ERROR: $pkg_path must have \"private\": true"
    echo "  Reason: @km/storage ↔ @km/fs-mount source-level cycle prevents safe npm publish."
    echo "  See hub/km/storage-architecture.md §6.6 and packages/$pkg_name/CLAUDE.md."
    EXIT=1
  fi
}

check_private "km-storage"
check_private "km-fs-mount"

if [ "$EXIT" -eq 0 ]; then
  echo "OK: @km/storage and @km/fs-mount are both private (source cycle contained)"
fi

exit "$EXIT"
