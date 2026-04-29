---
id: "@km/silvery/verify-publishable-broken"
aliases:
  - km-silvery.verify-publishable-broken
  - km-silvery-verify-publishable-broken
created_by: claude:a1a0e667
created_at: 2026-04-20T21:37:14Z
closed_at: 2026-04-20T22:33:05Z
close_reason: "Replaced verify.yml with verdaccio gate (silvery dad4172b, km
  17a05ea50). scripts/verify-publishable.ts spins up local verdaccio,
  sandbox-publishes all 16 workspace packages, then npm-installs + imports each
  public package. Simulation confirmed all three classes caught: (a) wrong
  publishConfig.exports, (b) missing dist file, (c) private:true on a
  should-be-public package. release.yml runs the same gate before publish;
  local: bun run verify-publishable."
---

# [x] Verify Publishable workflow chicken-and-egg: cross-pkg install pre-publish @km/silvery #bug #P2

blocks:: [[@km/silvery]]

Pre-existing CI bug, predates 0.19.0. The Verify Publishable workflow packs each package then npm-installs the tarball — but the tarball's transitive deps reference @silvery/color@<thisversion> which isn't on the registry yet. Fails on every push during release windows.

## Identified by
publishfix during @km/silvery/publishconfig-exports-fix work (5 consecutive Verify failures across 0.19.0/0.19.1/0.19.2).

## Symptom
npm error code ETARGET / notarget No matching version found for @silvery/color@0.19.X.

## Fix options (pick ONE)
1. **Quick GUARD**: install with workspace overrides — replace @silvery/* deps with file:./packages/* paths during verify.
2. **REDESIGN**: stand up a local verdaccio in the verify workflow, pnpm publish all packed tarballs to it, npm install from verdaccio. Real publish behavior, no npm pollution. Catches all three classes of bug that hit 0.19.0/0.19.1/0.19.2.
3. **SPEC + ARCHITECTURE**: wire the km /release skill (.claude/skills/release/) as the canonical publish path; release.yml calls bun release verify && bun release publish. The skill already exists for vendor submodules — silvery release.yml predates it.

## Recommended
Option 2 (verdaccio) — solves the bug class structurally. Option 3 if /release skill can absorb it cleanly.

## Cross-link
Lead /why analysis 2026-04-20 traced 3 broken silvery releases (0.19.0/0.19.1/0.19.2) to release.yml growing organically without pre-publish staging. Verdaccio gate makes 'publish broken in a way verify didn't catch' structurally impossible.

## Acceptance
- Verify Publishable workflow stays GREEN on commits during release windows.
- Three classes of publish bug caught BEFORE tag-publish: (a) wrong exports field, (b) empty tarball / missing dist, (c) EPRIVATE on accidentally-listed private packages.
- Optional: integration with /release skill enforcement.