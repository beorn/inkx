---
mentions:
  - km
id: "@km/all/sherif-vendor-exclude"
aliases:
  - km-all.sherif-vendor-exclude
  - km-all-sherif-vendor-exclude
created_by: Bjørn Stabell
created_at: 2026-04-16T21:08:01Z
closed_at: 2026-04-16T21:29:05Z
close_reason: Wrong framing — per user directive 'vendor/* is part of project
  for all purposes', exclusion is the wrong fix. Replaced with
  km-all.align-vendor-deps which proposes ALIGNING the conflicting versions
  across vendor/* and km root instead.
owner: bjorn@stabell.org
---

# [x] sherif: exclude vendor/* from workspace consistency checks @km/all #task #P3

SOP sherif scan reports 5 dependency-version conflicts:
  vitest, @types/bun, @types/node, playwright, yaml — all between
  km root and vendor/{bearly,mdspec,@km/storage,@km/markdown,@km/_orphan/agent}.

These are NOT real violations. Per vendor/CLAUDE.md, vendor packages
are standalone submodules that must work outside the km monorepo and
cannot use workspace:* — they pin their own versions. Sherif treats
them as monorepo siblings and flags every divergence.

Fix: configure sherif (or replace it) to exclude vendor/* from
multiple-dependency-versions, or split the workspaces array in the
root package.json so sherif sees only first-party packages.

Goal: sherif goes back to passing (✓) in /sop scans, surfacing only
real workspace consistency issues across packages/* and apps/*.

