# Theme Detection Startup Notes

Date: 2026-05-06

Scope: `km view`, `DeferredThemeProvider`, and silvery OSC palette detection.

## Problem

`km view` can show a theme background that differs from the user's terminal
default background. The current cache-miss path starts OSC theme detection from
`DeferredThemeProvider` after the first render, so it cannot overlap with board
loading and may briefly show the fallback theme.

Recent screenshots also showed two separate styling issues:

- Inline code such as `data.short_id` kept its own `$bg-muted` chip background
  inside a selected card.
- Top-bar text used muted foreground on the inverse/chrome background, producing
  low contrast in some detected themes.

## Current Status

This pass keeps the existing deferred-provider shape, with two important fixes:

- Cache-miss probes now use the active silvery `term.input` owner instead of
  starting a standalone stdin probe from inside the TUI.
- The theme cache schema is versioned at `3`, so old entries that may have
  conflated terminal background, selected background, ANSI blue, or a
  fallback-only failed probe are ignored.
- Fallback-equivalent probe results are not cached. If OSC probing fails, the
  next run should try again instead of pinning the fallback `#2e3440` background.

The probe still starts from `DeferredThemeProvider` after first render. It does
not yet overlap with pre-render board loading.

## Debugging

To see whether `km view` detected or loaded a theme:

```bash
DEBUG=km:tui:theme,km:tui:theme-cache DEBUG_LOG=/tmp/km-theme.log bun km view <path>
tail -f /tmp/km-theme.log
```

Useful log lines:

- `theme: loaded cached theme ... — skipping probe` means the cache was used.
- `theme: probe resolved → ...` means OSC probing completed and saved/applied a
  detected theme.
- `theme: probe failed — ...` means the fallback theme remained active.

To bypass the cache for one run:

```bash
DEBUG=km:tui:theme,km:tui:theme-cache DEBUG_LOG=/tmp/km-theme.log KM_FORCE_THEME_PROBE=1 bun km view <path>
```

To inspect the cache directly:

```bash
jq . "${XDG_CACHE_HOME:-$HOME/.cache}/km/theme-cache.json"
```

## Prior Constraints

Recall found the earlier startup-performance decision:

- `probeColors` can issue OSC 10/11 plus an OSC 4 palette burst. Older notes
  described this as roughly 18 OSC round trips and around 400 ms on warm paths.
- The full cold-start probe stack was estimated around 600-800 ms when combined
  with other terminal queries.
- The accepted optimization was cache/caps first: if the `(program, dark)` theme
  cache hits, skip live probing entirely.
- Live probing must go through the active silvery `term.input` owner when a TUI
  session exists. A standalone `process.stdin` probe can race the TUI input
  owner and either lose responses or disturb raw mode.
- Selection colors must not be inferred from ANSI blue or default terminal
  foreground/background. Those are separate roles.

## Good Startup Shape

The useful optimization is not "never probe"; it is "never block first paint on
the slow OSC path."

Preferred flow:

1. Detect terminal caps and compute the theme cache key synchronously.
2. If the cache hits, use the cached theme immediately and do not probe.
3. If the cache misses, start the OSC probe as soon as `term.input` exists.
4. Load/build the board state in parallel with the probe.
5. First render uses cached theme or fallback theme.
6. If the probe finishes before first render, first render gets the detected
   theme. Otherwise, render fallback and swap when the probe resolves.

This requires lifting the cache-miss probe out of `DeferredThemeProvider`'s
post-render effect into the runtime/controller startup path and passing a
`Promise<Theme>` or small probe task into the provider. The provider should
remain a consumer/coordinator of the result, not the only place that can start
the work.

## Guardrails

- Keep the cache-hit shortcut. Re-probing on every startup regresses warm start.
- Do not route live probes through raw `process.stdin` while a TUI term exists.
- Keep a fallback theme so first paint is never blocked by OSC timeouts.
- Invalidate old theme-cache entries when semantic color derivation changes.
- Treat terminal default background, theme canvas background, selected
  background, and code-chip background as distinct roles.
