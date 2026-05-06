---
mentions:
  - km
id: "@km/infra/vite-plus"
aliases:
  - km-infra.vite-plus
  - km-infra-vite-plus
created_by: claude:fed8de9e
created_at: 2026-03-25T21:10:36Z
owner: bjorn@stabell.org
---

# [ ] Explore Vite Plus (VoidZero) as unified toolchain — keep Bun as runtime @km/infra #task #P2

Evaluate VoidZero's Vite Plus (Vite 7 + Rolldown) as the build/bundle toolchain for all vendor packages. Goal: unified dev/build/publish pipeline, keep Bun as runtime.

## Context

GPT research (2026-03-25) found:

- **Vite Plus** = VoidZero's (Evan You) packaging of Vite + Rolldown (Rust bundler)
- Not a separate product — Vite DX layer + Rolldown engine under the hood
- Repo: https://github.com/voidzero-dev/vite-plus (PR #1005 worth reading)
- Relationship: VoidZero (org) → Rolldown (engine) → Vite Plus (product)

## Current State

All vendor packages publish raw TypeScript (ESM, no build step, node>=23.6.0). GPT consensus: this is fine for internal/Bun packages but **not best practice for public npm libraries**. Public packages should ship compiled JS + .d.ts.

Current publish flow (silvery): publish.ts temporarily edits package.json (workspace:* → versions), runs npm publish, restores. Could add tsc build + export swap to this flow.

## Questions to Explore

1. **Can Vite Plus replace our ad-hoc publish script?** Does it handle: version bump, workspace dep resolution, tsc build, npm publish?
2. **Library mode**: Does Vite Plus library mode work for pure TS packages (no CSS/assets)? Or is plain tsc still better?
3. **Rolldown vs tsc for library builds**: Rolldown bundles (single file output) vs tsc preserves modules (better tree-shaking for consumers). Which is right for silvery?
4. **Dev story**: Can we use Vite Plus dev server for silvery docs site + examples while keeping Bun for runtime/tests?
5. **Monorepo support**: Does Vite Plus handle our workspace structure (14 silvery sub-packages)?
6. **Bun compatibility**: Vite Plus is Node-oriented. Can we keep `bun test`, `bun run`, Bun runtime while using Vite Plus for builds?

## Recommended Approach

Per GPT research, for pure TS libraries the simplest state-of-the-art is:

- **tsc** for compilation (preserves modules, best tree-shaking)
- **tsup** if you need bundling + dual ESM/CJS
- **Vite library mode** only if you have CSS/assets
- **Rolldown** for performance at scale

Silvery is pure TS → **tsc is likely sufficient**. Vite Plus may be overkill for library builds but valuable for:

- silvery.dev docs site (already uses VitePress)
- Web examples/playground
- Future browser targets

## Decision Matrix

| Need                  | tsc    | tsup        | Vite Plus    |
| --------------------- | ------ | ----------- | ------------ |
| Pure TS library build | Best   | Good        | Overkill     |
| Multi-entry packages  | Manual | Auto        | Auto         |
| Browser targets       | No     | Basic       | Full         |
| Dev server            | No     | No          | Yes          |
| Docs site             | No     | No          | VitePress    |
| Monorepo              | Manual | Plugin      | Built-in     |
| Rust performance      | No     | Via esbuild | Via Rolldown |

## Immediate Action (no Vite Plus needed)

Add tsc build step to silvery publish.ts:

1. Run `tsc --outDir dist` for each package before publish
2. Swap exports from `./src/index.ts` → `./dist/index.js` in package.json
3. Publish compiled JS + .d.ts
4. Restore src/ exports after publish

This is ~20 lines of code in publish.ts and doesn't require any new tooling.

