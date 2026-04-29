---
id: "@km/termless/census-versions"
aliases:
  - km-termless.census-versions
  - km-termless-census-versions
created_by: claude:4929065a
created_at: 2026-03-23T01:00:03Z
closed_at: 2026-03-23T15:22:29Z
close_reason: "Working: census versions runs probes against older upstream
  versions. JS backends via npm install to cache dir + Vite resolve.alias. Probe
  hash caching skips unchanged runs. 3 xtermjs versions tested (5.4.0, 5.5.0,
  6.0.0). WASM backends fail in vitest VM (known)."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Census: run probes against older backend versions via nix @km/termless #feature #P3 @claude:4929065a

Unified version resolution: extend resolveBackend() with { version } option. Census uses the same API as users.

Architecture:
- resolveBackend('ghostty')                    → latest installed
- resolveBackend('ghostty', { version: '0.3.0' }) → specific version

Under the hood, version resolution is type-specific:
- JS/WASM (npm): install specific version to temp dir, import from there
- Rust (crate): cargo build with pinned crate version, cached in nix store
- C (source): git checkout tag + compile, cached

Census is just a loop:
  for (backend, versions) of catalog:
    for version of versions:
      b = await resolveBackend(backend, { version })
      runProbes(b)

Cache key: hash(probe files) + backend + version → result file
Skip if exists and probe hash matches.

versions.json catalog:
  { 'xtermjs': ['5.3.0', '5.4.0', '5.5.0'], 'ghostty': ['0.3.0', '0.4.0'] }

No separate infrastructure. Registry IS the infrastructure.