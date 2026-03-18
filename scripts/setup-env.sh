#!/bin/bash
# Cloud environment setup for Claude Code remote sessions.
# Usage: paste `bash scripts/setup-env.sh` as the setup script
# in Claude Desktop → Environment → Add environment.
set -euo pipefail

# --- Nix ---
if ! command -v nix &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf -L \
    https://install.determinate.systems/nix | sh -s -- install linux --no-confirm
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi

# --- Dev shell → persistent profile ---
cd "$HOME/repo"
nix develop --profile /nix/var/nix/profiles/dev

# Make flake tools available in all future shells
echo 'export PATH="/nix/var/nix/profiles/dev/bin:$PATH"' >> ~/.bashrc

# --- Bun (not in the shared flake) ---
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
fi
export PATH="$HOME/.bun/bin:/nix/var/nix/profiles/dev/bin:$PATH"

# --- Project dependencies ---
bun install --frozen-lockfile

echo "Environment ready."
