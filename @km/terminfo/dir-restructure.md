---
id: "@km/terminfo/dir-restructure"
aliases:
  - km-terminfo.dir-restructure
  - km-terminfo-dir-restructure
created_by: claude:f8196c1c
created_at: 2026-03-25T18:29:07Z
closed_at: 2026-03-25T18:57:25Z
close_reason: "Restructured terminfo.dev: content/ at root (editorial JSON +
  probes-apps/ + probes-libs/ + probes-mux/), packages/ (probes/ + cli/ + api/),
  docs/data/ (probes.data.ts + load-probes.ts). All imports updated, build
  passes, CLI works."
---

# [x] terminfo.dev directory restructure: content/, data/, src/probes/, src/cli/, src/api/ @km/terminfo #task #P3

Reorganize terminfo.dev directories per user preference:

Current:
  probes/         → src/probes/
  src/cli.ts etc  → src/cli/
  (new)           → src/api/generate-api.ts
  docs/data/results/ → data/results/  (measured data at root)
  vitest.census.ts → src/probes/vitest.probes.ts

Target:
  content/        ← editorial JSON (DONE)
  data/results/   ← measured census output
  docs/           ← VitePress site
  src/probes/     ← probe test files
  src/cli/        ← CLI commands
  src/api/        ← API/badge generation

Refs: content/ already extracted in this session. This bead covers the remaining moves.