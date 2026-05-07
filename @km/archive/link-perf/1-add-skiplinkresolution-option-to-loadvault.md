---
mentions:
  - km
id: "@km/link-perf/1-add-skiplinkresolution-option-to-loadvault"
aliases:
  - km-link-perf.1
  - km-link-perf-1
  - "@km/link-perf/1"
created_at: 2026-01-23T14:49:27Z
closed_at: 2026-01-23T14:59:51Z
---

# [x] Add skipLinkResolution option to loadVault @km/link-perf #task #P2

Add `skipLinkResolution?: boolean` to LoadOptions.
When true, skip the resolveLinks() phase entirely.

File: packages/@km/storage/src/vault-loader.ts

