---
id: "@km/infra/tsgolint-vendor"
aliases:
  - km-infra.tsgolint-vendor
  - km-infra-tsgolint-vendor
created_at: 2026-02-04T11:27:38Z
closed_at: 2026-02-06T11:00:48Z
---

# [x] tsgolint: no-unsafe false positives from vendor .ts exports @km/infra #bug #P3 @claude:9e69175d

## Problem
oxlint type-aware mode (tsgolint/typescript-go) cannot resolve types from vendor packages that export raw .ts source files. All @beorn/logger usage triggers no-unsafe-* warnings.

## Root Causes (confirmed 2026-02-06)
1. **Const alias**: `export const createlogger = createLogger` — oxlint loses type info through const assignments. Renaming all usages to `createLogger` (direct function export) eliminated ~340/536 warnings.
2. **ConditionalLogger type**: `Omit<Logger, ...> & { trace?: ... }` — oxlint can't fully resolve this Omit+optional pattern, producing any leaks even with direct imports.

## What DIDN'T work
- Building .d.ts for @beorn/logger — TypeScript resolves correctly but oxlint still can't handle the ConditionalLogger pattern

## Current mitigation
- Renamed `createlogger` → `createLogger` across ~40 source files (eliminated const alias issue)
- Extended oxlint override to suppress no-unsafe-* for all packages using @beorn/logger
- Warnings reduced from 536 → 6 (remaining 6 are intentional no-deprecated)