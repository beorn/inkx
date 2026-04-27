# npm Packages Registry

All packages published under maintainer `beorno`. Source of truth: `registry.npmjs.org/-/v1/search?text=maintainer:beorno&size=250`

Last updated: 2026-04-19 (62 packages live)

<!--
  AUDIT NOTES (run `bun npm-registry audit` for live diff)

  As of 2026-04-12 the live registry has 60 packages by maintainer beorno.
  All versions in this file match live npm.

  In md but missing from registry (local-only / unpublished / private packages):
    @silvery/ag, @silvery/ag-react, @silvery/ag-term, @silvery/commands,
    @silvery/create, @silvery/headless, @silvery/ink, @silvery/model,
    @silvery/scope, @silvery/selection, @silvery/signals, @silvery/test,
    @silvery/theme, @beorn/accountly, @beorn/tap, @beorn/watcher-chaos,
    claude-tty-mcp

  To regenerate this audit: `bun npm-registry audit`
-->


## Active Packages

### Silvery ecosystem

| Package | Version | Weekly DL | Notes |
|---------|---------|----------|-------|
| `silvery` | 0.19.0 | 844 | Main barrel — components, hooks, runtime, theme |
| `@silvery/ansi` | 0.19.0 | 383 | Terminal styling, ANSI primitives, detection, theme derivation |
| `@silvery/color` | 0.19.0 | 226 | Pure color math — hex/RGB/HSL, blending, contrast |
| `@silvery/commander` | 0.19.0 | 250 | Colorized Commander.js help |
| `@silvery/examples` | 0.18.0 | 194 | Interactive demos — `npx @silvery/examples` (private as of 0.18.2) |
| `@silvery/create` | 0.5.3 | 253 | App composition — createApp, pipe() (will be deprecated — bundled in silvery) |
| `@silvery/headless` | 0.5.1 | 14 | Pure state machines (will be deprecated — bundled in silvery) |
| `@silvery/test` | 0.5.3 | 252 | Testing utilities (will be deprecated — bundled in silvery) |
| `@silvery/theme` | 0.5.1 | 105 | 38 palettes, ThemeProvider (will be deprecated — bundled in silvery) |

### Foundation

| Package | Version | Weekly DL | Notes |
|---------|---------|----------|-------|
| `flexily` | 0.6.0 | 167 | Pure JS flexbox layout engine |
| `loggily` | 0.8.0 | 359 | Structured logging — debug/log/span, OTEL bridge, metrics, worker threads |
| `vimonkey` | 0.2.4 | 108 | Fuzz testing with auto-shrinking for Vitest |

### Termless

| Package | Version | Weekly DL | Notes |
|---------|---------|----------|-------|
| `@termless/core` | 0.6.0 | 172 | Headless terminal testing library |
| `@termless/cli` | 0.3.1 | 3 | CLI + MCP server |
| `@termless/test` | 0.3.1 | 8 | Vitest integration — matchers, fixtures |
| `@termless/xtermjs` | 0.3.1 | 23 | xterm.js backend |
| `@termless/vterm` | 0.3.1 | 8 | vterm.js backend |
| `@termless/vt100` | 0.3.1 | 3 | vt100.js backend |
| `@termless/vt220` | 0.1.1 | 0 | vt220.js backend |
| `@termless/vt100-rust` | 0.3.1 | 6 | Rust vt100 backend |
| `@termless/ghostty` | 0.3.1 | 2 | Ghostty WASM backend |
| `@termless/ghostty-native` | 0.3.1 | 4 | Ghostty native (Zig napi) backend |
| `@termless/alacritty` | 0.3.1 | 3 | Alacritty (Rust napi-rs) backend |
| `@termless/wezterm` | 0.3.1 | 2 | WezTerm (Rust napi-rs) backend |
| `@termless/libvterm` | 0.3.1 | 4 | libvterm (Emscripten WASM) backend |
| `@termless/kitty` | 0.3.1 | 4 | Kitty (subprocess) backend |
| `@termless/peekaboo` | 0.3.1 | 16 | OS-level terminal automation backend |

### vterm

| Package | Version | Weekly DL | Notes |
|---------|---------|----------|-------|
| `vt100.js` | 0.1.2 | 38 | VT100 emulator — monochrome, pure TS |
| `vt220.js` | 0.1.2 | 29 | VT220 emulator — 8 colors, pure TS |
| `vterm.js` | 0.4.0 | 22 | Modern emulator — full VT/xterm, pure TS |

### Bearly tools

| Package | Version | Weekly DL | Notes |
|---------|---------|----------|-------|
| `@bearly/tribe` | 0.11.1 | 342 | Cross-session coordination MCP server |
| `@bearly/github` | 0.1.0 | 14 | GitHub notifications MCP server |
| `alien-projections` | 0.1.3 | 9 | Incremental reactive collection transforms (alien-signals) |
| `alien-resources` | 0.1.3 | 9 | Async signal bridge (alien-signals) |
| `alien-trees` | 0.1.1 | — | Tree-scoped reactive aggregates (alien-signals) |
| `vitepress-enrich` | 0.4.1 | 300 | Glossary linking, SEO, tooltips for VitePress |

### Other

| Package | Version | Weekly DL | Notes |
|---------|---------|----------|-------|
| `mdspec` | 0.3.5 | 52 | Markdown spec testing |
| `terminfo.dev` | 3.3.1 | 25 | Terminal capability database site |

## Deprecated (internal, use silvery barrel instead)

| Package | Version | Notes |
|---------|---------|-------|
| `@silvery/ag` | 0.5.2 | Core types — bundled in silvery |
| `@silvery/ag-react` | 0.5.2 | React reconciler — bundled in silvery |
| `@silvery/ag-term` | 0.5.2 | Terminal runtime — bundled in silvery |
| `@silvery/ink` | 0.5.0 | Ink compat layer — bundled in silvery |
| `@silvery/commands` | 0.5.2 | Command registry — bundled in silvery |
| `@silvery/scope` | 0.5.0 | Structured concurrency — bundled in silvery |
| `@silvery/signals` | 0.5.0 | Reactive signals — bundled in silvery |
| `@silvery/model` | 0.5.0 | DI model factories — bundled in silvery |

## Renamed/Superseded (should deprecate)

| Package | Version | Replaced by |
|---------|---------|------------|
| `@bearly/vitepress-enrich` | 0.3.6 | `vitepress-enrich` (unscoped) |
| `@bearly/mdtest` | 0.3.0 | `mdspec` (renamed — `mdtest` was taken on npm) |
| `@silvery/react` | 0.3.0 | `silvery` |
| `@silvery/tea` | 0.4.2 | `silvery` |
| `@silvery/term` | 0.3.0 | `silvery` |
| `@silvery/cli` | 0.4.2 | `silvery` |
| `@silvery/theme-detect` | 0.19.0 | `@silvery/ansi` (probeColors) + `@silvery/theme` (detectScheme/detectTheme) — killed 2026-04-20, package was a thin re-export shell with zero unique code |
| `@termless/monorepo` | 0.3.0 | `@termless/core` |
| `termless` | 0.0.2 | `@termless/core` |

## Name Reservations (0.0.1 placeholders)

| Package | Notes |
|---------|-------|
| `aicentral` | Reserved |
| `corecmd` | Reserved |
| `corecommand` | Reserved |
| `silverai` | Reserved |
| `silvercode` | Reserved |
| `silvercommand` | Reserved |
| `silvertea` | Reserved |
| `termily` | Reserved |
| `textily` | Reserved — future text editing library? |
| `hottest` | Reserved |
| `strictest` | Reserved |
| `mostlydb` | 0.1.0 — reserved or early prototype |
| `@visory/visory` | Reserved |
| `@finetea/term` | Reserved |
| `@finetea/ansi` | Reserved |
| `@finetea/core` | Reserved |
| `@finetea/ui` | Reserved |
| `@termless/term` | Reserved |
| `acproxy` | Reserved 2026-04-27 — ACP proxy candidate |
| `acplane` | Reserved 2026-04-27 — ACP control-plane candidate |
| `acplex` | Reserved 2026-04-27 — ACP multiplexer candidate |
| `acpdock` | Reserved 2026-04-27 — ACP proxy candidate (dock metaphor) |
| `acpmux` | Reserved 2026-04-27 — ACP multiplexer candidate |
| `agentplex` | Reserved 2026-04-27 — agent multiplexer candidate |
| `agentward` | Reserved 2026-04-27 — agent guardian candidate |
| `proxyacp` | Reserved 2026-04-27 — alt acproxy ordering |
| `fleetly` | Reserved 2026-04-27 — fleet-management candidate (ly-suffix family) |
| `brokerly` | Reserved 2026-04-27 — agent-broker candidate (ly-suffix family) |
| `overhear` | Reserved 2026-04-27 — ambient/observation candidate |
| `overheard` | Reserved 2026-04-27 — ambient/observation candidate (past-tense variant) |
| `interagent` | Reserved 2026-04-27 — inter-agent coordination candidate |
| `crossagent` | Reserved 2026-04-27 — cross-agent coordination candidate |
| `aianywhere` | Reserved 2026-04-27 — location-of-AI candidate |
| `agentanywhere` | Reserved 2026-04-27 — location-of-agent candidate |
| `aiwhere` | Reserved 2026-04-27 — short location-aware candidate |
| `agent7` | Reserved 2026-04-27 — agent + lucky-7 numeric brand |
| `agent9` | Reserved 2026-04-27 — agent + 9 numeric brand |
| `agentall` | Reserved 2026-04-27 — universal-agent candidate |
| `agentorb` | Reserved 2026-04-27 — agent-orb / orchestration brand |
| `agentsea` | Reserved 2026-04-27 — agent-sea (broad pool of agents) |
| `agentsee` | Reserved 2026-04-27 — agents-that-see (observation framing) |
| `seegent` | Reserved 2026-04-27 — see + agent contraction |
| `@beorno/chatly` | Reserved 2026-04-27 — unscoped `chatly` similarity-blocked vs `chalk`; held under @beorno scope |
| `cleverly` | Reserved 2026-04-27 — clever-as-a-property brand (ly-suffix family) |
| `smartly` | Reserved 2026-04-27 — smart-as-a-property brand (ly-suffix family) |
| `agentplus` | Reserved 2026-04-27 — agent+ premium-tier candidate |
| `agentfox` | Reserved 2026-04-27 — agent + animal-mascot brand |
| `agentmonkey` | Reserved 2026-04-27 — agent + animal-mascot brand |
| `@beorno/iqly` | Reserved 2026-04-27 — unscoped `iqly` similarity-blocked vs `mlly` |
| `@beorno/memgent` | Reserved 2026-04-27 — unscoped `memgent` similarity-blocked vs `moment`; memory-agent contraction |

**Considered but blocked (2026-04-27)** — kept here so we don't re-attempt:

- `chatly` — similarity-blocked vs `chalk`. Held as `@beorno/chatly`.
- `iqly` — similarity-blocked vs `mlly`. Held as `@beorno/iqly`.
- `memgent` — similarity-blocked vs `moment`. Held as `@beorno/memgent`.
- `agently` — taken (maplemx, 1.1.3, active).
- `mi6` — taken (rschmukler, 0.3.1).
- `agentops` — taken (agentops.ai, active).
- `agent8` — taken (kimwz, 1.0.8).
- `agentbox` — security-hold (npm `0.0.1-security`); cannot be claimed.
- `agentiq` — taken (tanishqxsharma, 0.2.0).
- `smartagent` — taken (dev.smartpricing, 0.0.1).

## Not Published (local only)

| Package | Location | Notes |
|---------|----------|-------|
| `vitest-silvery-dots` | vendor/bearly/packages/ | Ready to publish — streaming Vitest reporter |
| `@silvery/selection` | packages/silvery-selection/ | Pure selection state machine |
| `@beorn/accountly` | vendor/accountly/ | Multi-account credential manager (private) |
| `@beorn/tap` | vendor/tap/ | TAP stream orchestration (private) |
| ~~`@beorn/watcher-chaos`~~ | vendor/watcher-chaos/ | Internal only — NOT released, no GitHub repo |
| `claude-tty-mcp` | vendor/bearly/plugins/tty/ | TTY testing MCP server |
| ~~`@bearly/lore`~~ | vendor/bearly/plugins/tribe/ (absorbed) | Formerly workspace daemon — folded into @bearly/tribe on 2026-04-17. |
| `@bearly/recall` | vendor/bearly/plugins/recall/ | Session-history search primitive — FTS5 + LLM planner/agent. Used by `@bearly/tribe` internally (private, 0.1.0). Extracted from tools/recall + tools/lib/history on 2026-04-17. |
| `@bearly/llm` | vendor/bearly/plugins/llm/ | Multi-provider LLM dispatch — cheap-model race, consensus, deep research, mock for tests (private, 0.1.0). Extracted from tools/lib/llm on 2026-04-17. |
