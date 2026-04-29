---
id: "@km/termless/census"
aliases:
  - km-termless.census
  - km-termless-census
created_by: claude:4929065a
created_at: 2026-03-22T20:16:44Z
closed_at: 2026-03-22T22:17:14Z
close_reason: "Census package scaffolded (types + runner). Probes and CLI
  deferred — design captured in bead description. Concept: tests as single
  source of truth, per-probe cache invalidation by source hash, nix for
  version-pinned builds."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] caniuse: test-driven terminal capability database + web page @km/termless #feature #P2 @claude:4929065a

Build a caniuse.com-style terminal capability database for termless.dev. Tests are the single source of truth — probes feed ANSI sequences to backends and record structured results.

## Architecture
1. Feature probes (vitest) → caniuse.json (artifact) → termless.dev/caniuse (VitePress page)
2. Probes are a superset of conformance tests — every cross-backend test is a probe
3. Version testing: run probes against different upstream versions of the same backend
4. Backend binaries cached (don't recompile for every run)

## Components
- Probe framework: describe(feature, spec, probe_fn) → structured result (supported/partial/no/unknown + notes)
- Feature taxonomy: ECMA-48 SGR, cursor, modes, extensions (kitty kb, kitty graphics, sixel, OSC 8, etc.)
- JSON output: backends × features × versions matrix
- VitePress page: filterable table generated from caniuse.json
- CLI command: termless caniuse [--backend X] [--upstream-version Y]
- Backend version caching: compiled .node/.wasm files cached by version hash

## Version testing flow
- npm-distributed backends: temporarily install different upstream version, rebuild, run probes, restore
- Compiled backends: cache built artifacts by upstream version in .termless-cache/
- Results tagged with version: { xtermjs: { '5.4.0': { support: 'no' }, '5.5.0': { support: 'yes' } } }

## First milestone
- 50+ feature probes covering SGR, cursor, modes, scrollback, extensions
- Run against all installed backends (xtermjs, ghostty, vt100, vt100-rust at minimum)
- Generate caniuse.json
- Basic VitePress page rendering the matrix