#!/bin/bash
# Publish all vendor packages to npm in dependency order.
# Uses pnpm publish for publishConfig.exports support.
#
# Usage:
#   ./packages/km-infra/scripts/publish-all.sh           # Dry run (default)
#   ./packages/km-infra/scripts/publish-all.sh --publish # Actually publish

set -e

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DRY_RUN=true

if [[ "$1" == "--publish" ]]; then
  DRY_RUN=false
fi

# Build all packages first
echo "=== Building all packages ==="
cd "$ROOT/vendor/loggily" && npx tsdown
cd "$ROOT/vendor/silvery" && npx tsdown
for pkg in "$ROOT"/vendor/silvery/packages/*/; do
  name=$(basename "$pkg")
  if [ -f "$pkg/package.json" ] && grep -q '"tsdown"' "$pkg/package.json" 2>/dev/null; then
    cd "$pkg" && npx tsdown
  fi
done
cd "$ROOT/vendor/silvery/examples" && npx tsdown
cd "$ROOT/vendor/flexily" && npx tsdown 2>/dev/null || true
for pkg in "$ROOT"/vendor/bearly/packages/*/; do
  if [ -f "$pkg/package.json" ] && grep -q '"tsdown"' "$pkg/package.json" 2>/dev/null; then
    cd "$pkg" && npx tsdown
  fi
done
echo ""

# Publish order: leaves first, then dependents
# Tier 0: no @silvery deps
TIER0=(
  "$ROOT/vendor/loggily"
  "$ROOT/vendor/silvery/packages/color"
  "$ROOT/vendor/silvery/packages/headless"
)

# Tier 1: depends on tier 0
TIER1=(
  "$ROOT/vendor/silvery/packages/ansi"
  "$ROOT/vendor/silvery/packages/theme"
  "$ROOT/vendor/silvery/packages/commander"
)

# Tier 2: depends on tier 0-1
TIER2=(
  "$ROOT/vendor/silvery/packages/create"
  "$ROOT/vendor/silvery/packages/test"
)

# Tier 3: barrel (depends on all)
TIER3=(
  "$ROOT/vendor/silvery"
)

# Tier 4: depends on barrel
TIER4=(
  "$ROOT/vendor/silvery/examples"
)

# Also: non-silvery packages
OTHER=(
  "$ROOT/vendor/flexily"
)

publish_pkg() {
  local dir="$1"
  cd "$dir"
  local name=$(python3 -c "import json; print(json.load(open('package.json'))['name'])")
  local version=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")
  local private=$(python3 -c "import json; print(json.load(open('package.json')).get('private', False))")

  if [ "$private" = "True" ]; then
    echo "  SKIP $name (private)"
    return
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "  DRY  $name@$version"
    pnpm pack --dry-run 2>&1 | head -3
  else
    echo "  PUB  $name@$version"
    pnpm publish --no-git-checks --access public 2>&1
  fi
}

echo "=== Publishing (dry_run=$DRY_RUN) ==="
echo ""

echo "--- Tier 0 (no deps) ---"
for dir in "${TIER0[@]}"; do publish_pkg "$dir"; done

echo "--- Tier 1 ---"
for dir in "${TIER1[@]}"; do publish_pkg "$dir"; done

echo "--- Tier 2 ---"
for dir in "${TIER2[@]}"; do publish_pkg "$dir"; done

echo "--- Tier 3 (barrel) ---"
for dir in "${TIER3[@]}"; do publish_pkg "$dir"; done

echo "--- Tier 4 (examples) ---"
for dir in "${TIER4[@]}"; do publish_pkg "$dir"; done

echo "--- Other ---"
for dir in "${OTHER[@]}"; do publish_pkg "$dir"; done

echo ""
if [ "$DRY_RUN" = true ]; then
  echo "=== Dry run complete. Run with --publish to actually publish. ==="
else
  echo "=== All packages published! ==="
  echo ""
  echo "Smoke test:"
  echo "  node -e \"import('silvery').then(m => console.log('silvery OK'))\""
  echo "  node -e \"import('loggily').then(m => console.log('loggily OK'))\""
  echo "  npx @silvery/examples --help"
fi
