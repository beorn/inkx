# npm Packages Registry

All packages published under maintainer `beorno`. Source of truth: `registry.npmjs.org/-/v1/search?text=maintainer:beorno&size=250`

Last updated: 2026-04-12 (63 packages)

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
| `silvery` | 0.17.4 | 844 | Main barrel — components, hooks, runtime, theme |
| `@silvery/ansi` | 0.17.3 | 383 | Terminal styling, ANSI primitives, detection, theme derivation |
| `@silvery/color` | 0.17.3 | 226 | Pure color math — hex/RGB/HSL, blending, contrast |
| `@silvery/commander` | 0.17.5 | 250 | Colorized Commander.js help |
| `@silvery/examples` | 0.17.7 | 194 | Interactive demos — `npx @silvery/examples` |
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
| `vterm.js` | 0.3.1 | 22 | Modern emulator — full VT/xterm, pure TS |

### Bearly tools

| Package | Version | Weekly DL | Notes |
|---------|---------|----------|-------|
| `@bearly/tribe` | 0.10.0 | 342 | Cross-session coordination MCP server |
| `@bearly/github` | 0.1.0 | 14 | GitHub notifications MCP server |
| `alien-projections` | 0.1.3 | 9 | Incremental reactive collection transforms (alien-signals) |
| `alien-resources` | 0.1.3 | 9 | Async signal bridge (alien-signals) |
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
| `@bearly/vitepress-enrich` | 0.3.7 | `vitepress-enrich` (unscoped) |
| `@bearly/mdtest` | 0.3.0 | `mdspec` (renamed — `mdtest` was taken on npm) |
| `@silvery/react` | 0.3.0 | `silvery` |
| `@silvery/tea` | 0.4.2 | `silvery` |
| `@silvery/term` | 0.3.0 | `silvery` |
| `@silvery/cli` | 0.4.2 | `silvery` |
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
