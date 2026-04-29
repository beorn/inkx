---
id: "@km/bearly/llm-loggily-migration"
aliases:
  - km-bearly.llm-loggily-migration
  - km-bearly-llm-loggily-migration
created_by: claude:87d20187
created_at: 2026-04-27T18:58:49Z
closed_at: 2026-04-27T20:04:39Z
close_reason: >-
  Migration complete. All 6 originally-listed call sites resolved:


  - apps/km-cli/src/commands/daemon.ts → loggily km:cli:daemon namespace (km
  commit 4cfa4160b)

  - vendor/silvery/packages/ag-term/src/runtime/create-app.tsx (2 trace banners)
  → loggily silvery:trace namespace (silvery commit b659f486, on silvery main
  578875c5)

  - vendor/bearly/plugins/llm/src/lib/dual-pro.ts (2) → ALLOWLIST in lint
  (schema-versioned domain data, not observability)

  - vendor/bearly/plugins/llm/src/lib/dispatch.ts (1 — ab-pro.jsonl) → ALLOWLIST
  in lint (champion-challenger leaderboard data)


  BASELINE_APPEND_LOG_FILE: 6 → 0. The lint now locks the loggily-bypass surface
  at zero. (km commit 9448fda81)


  Architectural finding (recorded in commits): the original bead treated all 6
  sites as needing loggily migration. Review revealed 3 are persistent
  application data with explicit schema fields — loggily is the wrong tool.
  Allowlisted by filename in the lint script with documentation of why. Caveat
  noted: loggily 0.6.0 doesn't expose addWriterFor(namespace, writer) — the
  silvery agent worked around this by filtering on .includes('silvery:trace') in
  the formatted line, which is fragile. Worth filing as a loggily enhancement if
  the pattern propagates.


  Verification:


  - bash packages/km-infra/scripts/check-no-raw-logging.sh → OK: no-raw-logging
  clean

  - All vendor/bearly tests pass via km-root vitest

  - All km-cli tests pass (327)

  - 0 new tsc errors


  Commits:


  - vendor/bearly: integrated as part of obs work (67642e5, 3b1ce6a)

  - vendor/silvery: b659f486 chore(ag-term): migrate create-app trace banners to
  loggily

  - km: 4cfa4160b refactor(km-cli,obs-lint), 9448fda81 fix(obs-lint): baseline
  2→0


  All pushed to origin (verified via git ls-remote on each repo's main).
---

# [x] Migrate dual-pro/dispatch/silvery/km-cli to loggily @km/bearly #task #P3

blocks:: [[@km/bearly]]

# Why

The @km/bearly/unified-observability lint locks bg-recall + injection-envelope at L4 (no parallel observability paths). When that bead landed, the lint baseline of 2 missed four pre-existing call sites:

- \`apps/km-cli/src/commands/daemon.ts:376\` — \`appendFileSync(this.paths.log, line)\`
- \`vendor/bearly/plugins/llm/src/lib/dual-pro.ts:826,853\` — backtest-runs.jsonl + dual-pro-promotions.jsonl
- \`vendor/bearly/plugins/llm/src/lib/dispatch.ts:1987\` — ab-pro.jsonl (champion-challenger trace)
- \`vendor/silvery/packages/ag-term/src/runtime/create-app.tsx:1820,1828\` — /tmp/silvery-trace.log debug

Lint baseline was bumped from 2 → 6 to honestly reflect main; this bead migrates those 6 sources to loggily so the baseline can return to 0.

# What

For each call site, replace direct \`appendFileSync\` with the loggily pattern:

\`\`\`typescript
import { createLogger, addWriter, createFileWriter } from "loggily"
const log = createLogger("namespace:event-class")
log.info("...", { structured, fields })

// At app startup (host code):
addWriter(createFileWriter(process.env.LOGGILY_FILE).write)
\`\`\`

Per-file:
- @km/_orphan/cli daemon log: \`createLogger("km-cli:daemon")\` + \`addWriter\` keyed on \`KM_DAEMON_LOG\` env (or unified \`LOGGILY_FILE\`)
- dual-pro: \`createLogger("bearly:llm:dual-pro:backtest|promote|ab")\` — three namespaces for the three JSONL files
- silvery debug trace: \`createLogger("silvery:trace")\` + \`addWriter\` keyed on \`SILVERY_TRACE\` env

# Acceptance

- bash packages/@km/infra/scripts/check-no-raw-logging.sh → BASELINE_APPEND_LOG_FILE bumped DOWN to 0
- bash packages/@km/infra/scripts/check-no-raw-logging.sh → OK: no-raw-logging clean
- All 6 call sites read structured records via DEBUG=ns:* + LOGGILY_FILE
- Migration recipe documented in CHANGELOG of each package
- npx tsc --noEmit | grep "error TS" → no new errors

# Out of scope

- The 2 INJECTION_DEBUG_LOG references in plugins/injection-envelope/src/debug.ts (back-compat shim — drops in next minor)

# Reference

- @km/bearly/unified-observability (closed) — established the lint + baseline policy
- packages/@km/infra/scripts/check-no-raw-logging.sh — the baseline lock
- .claude/skills/logging/SKILL.md — canonical pattern