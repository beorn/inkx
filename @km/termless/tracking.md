---
mentions:
  - km
id: "@km/termless/tracking"
aliases:
  - km-termless.tracking
  - km-termless-tracking
created_by: claude:4929065a
created_at: 2026-03-23T03:45:18Z
closed_at: 2026-03-23T05:35:56Z
close_reason: "All items complete: census v4 (dot-path IDs + expect), deprecated
  shim removal, doc fixes, update command, CLI improvements."
owner: bjorn@stabell.org
---

# [x] termless: backend management + census system @km/termless #epic #P2

Tracking epic for termless development. 9 backends, census probe system, Playwright-grade CLI.

## What's done

- Backend management: backends.json manifest, BackendType system (js/wasm/native/os), backend() one function
- 9 backends: xtermjs, ghostty, vt100, vt100-rust (built), libvterm (WASM built), alacritty, wezterm, kitty (GPL scaffold), peekaboo
- Census: 61 probes across 8 categories, check() assertions, vitest JSON → report.ts pipeline, VitePress page
- API: backend(), isReady(), createTestTerminal(), describeBackends(), backendCases()
- CLI: backends (type+version+status), install (shows other backends), doctor
- Vendor boundary: vendor/CLAUDE.md + violations fixed
- Nix flake: bun + rust + emscripten dev shell
- Pro reviews: 2x GPT 5.4 Pro (.05), findings addressed
- src/backends.ts redesign: BackendType polymorphism, isReady() checks build artifacts

## What's open

1. Census _backends.ts uses manual imports — should use registry (blocked: import.meta.resolve broken in vitest VM)
2. Ghostty WASM doesn't load in vitest census context (loads fine outside vitest)
3. termless update command — check npm/crates.io for newer upstream versions (bead: @km/termless/update-cmd)
4. Census versions — run probes against older versions via nix (bead: @km/termless/census-versions)
5. Census reporter — custom vitest reporter doesn't fire onFinished (using JSON pipe workaround)
6. Census web page — needs census/results/current.json generated and committed for VitePress to render
7. Migrate CLI from deprecated registry functions to new backend()/isReady()/backends() API
8. Remove deprecated compat shims once CLI is migrated

## Key files

- src/backends.ts — core: backend(), isReady(), BackendType, manifest
- src/backends-advanced.ts — subpath export for advanced APIs
- packages/census/probes/_backends.ts — census infrastructure (check(), census() wrapper)
- packages/census/probes/*.probe.ts — 8 category files, 61 total probes
- packages/census/src/report.ts — vitest JSON → census JSON post-processor
- packages/cli/src/*.ts — CLI commands
- backends.json — manifest (9 backends)
- vitest.census.ts — separate vitest config for census
- flake.nix — nix dev shell
- vendor/CLAUDE.md — vendor boundary rules

## Architecture

Three inputs → everything derived:

- backends.json + BackendType → resolution, installation, CLI
- probes/*.probe.ts → census results → web page
- nix flake → versioned builds → version-pinned census

