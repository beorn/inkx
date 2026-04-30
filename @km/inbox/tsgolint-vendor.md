---
id: "@km/inbox/tsgolint-vendor"
aliases:
  - km-tsgolint-vendor
  - "@km/_orphan/tsgolint-vendor"
created_at: 2026-02-04T10:18:40Z
closed_at: 2026-02-04T11:27:39Z
---

# [x] tsgolint: no-unsafe false positives from vendor .ts exports @km/_orphan #bug #P3

oxlint type-aware (tsgolint/typescript-go) cannot resolve types from vendor packages that export raw .ts source files. All @beorn/logger usage triggers no-unsafe-* warnings (~35 warnings). Root cause: tsgolint docs say 'Build dependent packages so .d.ts files are available' but our vendor packages use exports: { ".": "./src/index.ts" }. Options: accept as warnings, build .d.ts for vendor, or wait for tsgolint to support bundler resolution of .ts exports.