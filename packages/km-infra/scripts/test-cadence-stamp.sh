#!/usr/bin/env bash
# Touch a stamp file marking the last successful run of a named test suite.
# Used by SessionStart cadence reminder to surface stale-test prompts.
#
# Usage:  bash test-cadence-stamp.sh fuzz
# Stamps: $XDG_STATE_HOME/km-cadence/last-<name> (default: ~/.local/state/km-cadence/)
set -e
name="${1:?usage: test-cadence-stamp.sh <name>}"
dir="${XDG_STATE_HOME:-$HOME/.local/state}/km-cadence"
mkdir -p "$dir"
touch "$dir/last-$name"
