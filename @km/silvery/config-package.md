---
id: "@km/silvery/config-package"
aliases:
  - km-silvery.config-package
  - km-silvery-config-package
created_by: claude:4de4a3ab
created_at: 2026-04-26T21:01:47Z
closed_at: 2026-04-26T23:08:13Z
close_reason: "Shipped at 59b936a9 (silvery) + d1c7d3690 (km). 83 tests in
  @silvery/config; 8 tests in cli-resolve.test.ts; doctor checkers consolidated
  4→1; all /complete grep criteria pass (--track/--layout/--bare/--pane-headers
  all 0 hits; resolveConnection + mountConfigCommand wired; typecheck clean;
  help output lowercase + tight per /silverize convention; ~/...  paths shown in
  friendly form). Two follow-ups tracked: km-storage.adopt-silvery-config (P3)
  for km-cli unification; km-silvercode.zero-config (existing) for env-var
  auto-discovery."
---

# [x] Build @silvery/config — generic config + named-registry primitives @km/silvery #feature #P2 @claude:4de4a3ab

blocks:: [[@km/silvery]]

Generic config-tree + named-registry primitives. Two layers:

**Layer 1 — Config**: deep-key get/set/unset/list/save on a YAML file (git-config analog). Atomic write. No cosmiconfig dep (per prior design signal).

**Layer 2 — Registry<Kind>**: typed view over a sub-tree with:
- string-projection (qs-style parse/format with type coercion: boolean/number/array/nested)
- string-or-object schema (oneOf via Zod)
- reserved-key validation (e.g. "default")
- default()/setDefault() shortcuts
- resolve() accepting registry-label OR connection-string OR built-in shortcut

**Commander helpers**:
- mountConfigCommand(program, config) → wires `app config <key>[=<val>]` (get/set/unset/list/edit/get-regexp)
- mountRegistryCommand(program, name, registry) → wires `app <name> list|show|add|rm`

**Files**: vendor/silvery/packages/config/{src,tests,package.json,README.md}

**Ship gate**: two consumers in tests — synthetic test consumer + a doc example showing silvercode-shaped config.

**Deps**: zod (schema), js-yaml (parse/serialize). Peer-dep @silvery/commander.

**No**: cosmiconfig (dependency hygiene), no plugins, no events, no introspection beyond list/format/resolve. YAGNI.