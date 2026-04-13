#!/bin/bash
# Deprecate packages that are now private (internal-only)
# These were previously published but are now bundled into the silvery barrel.
# This script publishes a final patch with a deprecation notice.

set -e

PACKAGES=(
  "@silvery/ag"
  "@silvery/ag-react"
  "@silvery/ag-term"
  "@silvery/ink"
  "@silvery/commands"
  "@silvery/model"
  "@silvery/scope"
  "@silvery/signals"
)

echo "This will deprecate ${#PACKAGES[@]} packages on npm."
echo "Each will get a deprecation notice directing users to 'silvery' instead."
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

for pkg in "${PACKAGES[@]}"; do
  echo "Deprecating $pkg..."
  npm deprecate "$pkg" "This package is now internal. Use 'silvery' instead — it bundles all @silvery/* packages." 2>&1 || echo "  Failed to deprecate $pkg"
done

echo ""
echo "Done. All ${#PACKAGES[@]} packages deprecated on npm."
