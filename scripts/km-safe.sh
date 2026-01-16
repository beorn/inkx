#!/bin/bash
# km-safe.sh - Wrapper script that ensures terminal state is restored
#
# This works around a Bun 1.3.5 bug (oven-sh/bun#25666) where SIGTRAP
# crashes on Apple Silicon can leave the terminal in a broken state.
#
# Usage: ./scripts/km-safe.sh view --tui2 @next.md
#
# The script saves terminal state before running km and restores it after,
# regardless of how the process exits.

# Save terminal state
saved_stty=""
if [ -t 0 ]; then
  saved_stty=$(stty -g 2>/dev/null)
fi

# Restore terminal function
restore_terminal() {
  # Restore stty settings
  if [ -n "$saved_stty" ] && [ -t 0 ]; then
    stty "$saved_stty" 2>/dev/null
  fi

  # Show cursor
  printf '\033[?25h'

  # Leave alternate screen buffer
  printf '\033[?1049l'

  # Reset all attributes
  printf '\033[0m'

  # Clear from cursor to end of line
  printf '\033[K'
}

# Set up trap for all exit signals
trap restore_terminal EXIT INT TERM HUP QUIT ABRT

# Run km with all arguments
bun km "$@"
exit_code=$?

# Terminal will be restored by the trap
exit $exit_code
