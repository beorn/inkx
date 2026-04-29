---
id: "@km/infra/cc-silvery-flexily"
aliases:
  - km-infra.cc-silvery-flexily
  - km-infra-cc-silvery-flexily
created_by: claude:a7ba47d7
created_at: 2026-02-22T21:20:19Z
---

# [ ] Reimplement Claude Code TUI on silvery+flexily @km/infra #feature #P4

Replace Ink + Yoga WASM in Claude Code's terminal UI with hightea + flexture.

## Why

Claude Code's TUI is built on Ink (React terminal renderer) + Yoga (WASM flexbox). Multiple bugs fixed in 2.1.47-2.1.50 are in exactly this layer. hightea+flexture eliminates entire bug categories and unlocks capabilities Ink cannot provide.

## Benefits

### Memory & stability (eliminates 5+ recent leak fixes)
- **No WASM linear memory growth** — Flexture is pure TypeScript; Yoga WASM allocates linear memory that grows monotonically and cannot be reclaimed without module reset. Three separate fixes across 2.1.47-2.1.50 were Yoga memory leaks.
- **Layout caching** — Flexture fingerprints nodes and caches results; unchanged subtrees skip recomputation. Static UI (status bar, headers, chrome) has zero layout cost after first render.
- **Zero initialization overhead** — no async WASM loading; Flexture is synchronous import. Claude Code 2.1.50 defers Yoga WASM for headless mode — unnecessary with Flexture.
- **No native dependencies** — pure JS/TS. No Yoga NAPI C++ compilation or WASM binaries.
- **Disposable cleanup (using)** — automatic resource cleanup prevents orphaned processes (2.1.46 fixed orphaned CC processes on macOS disconnect).