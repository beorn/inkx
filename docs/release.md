# Release & Publishing

Silvery uses two GitHub Actions workflows for releases:

- `verify.yml` — runs on every push to `main` and every PR. Pre-publish gate.
- `release.yml` — runs on tag push (`v*`). Publishes to npm + GitHub Release.

Both share the same engine: `scripts/verify-publishable.ts`.

## Pre-publish gate (verify-publishable)

Pre-publish bugs are expensive — once a broken `silvery@0.19.X` reaches the npm registry it is forever-pinned in users' lockfiles. The gate catches three classes of bug _before_ the tag push:

1. **Wrong `publishConfig.exports`** — the `exports` field reachable from a published tarball does not actually map to a file in `dist/`. Silvery 0.19.0 shipped this way; consumers got `Cannot find module ./src/index.ts`.
2. **Empty tarball / missing dist** — `tsdown` crashed silently or ran from the wrong cwd; the package ships without its build output.
3. **EPRIVATE on accidentally-listed public package** — a package that is supposed to publish (e.g. `@silvery/color`) still has `private: true` in `package.json`. `npm publish` would refuse, halting the release midway.

The gate works by spinning up a local [verdaccio](https://verdaccio.org/) (npm-compatible registry), publishing **every** workspace package to it, then `npm install`ing each public package into a fresh tmpdir and running `import('@silvery/<pkg>')`. If the import returns named exports, the package is publishable.

The legacy verify workflow ran `npm install <packed-tarball.tgz>` directly, which always failed during release windows because the tarball's transitive deps reference `@silvery/<dep>@<thisversion>` that wasn't on the public registry yet (chicken-and-egg). Verdaccio breaks the loop by hosting every cross-dep itself.

## Run locally

```bash
bun run verify-publishable
```

Equivalent to `bun scripts/verify-publishable.ts`. Builds first, then publishes to a verdaccio instance on `127.0.0.1:4873`, then runs the import probes.

Useful flags:

- `--no-build` — skip `bun run build:all` (use existing `dist/`).
- `--keep` — leave verdaccio + tmpdirs alive for inspection.
- `VERDACCIO_PORT=4874 bun run verify-publishable` — use a different port.
- `VERDACCIO_DEBUG=1 bun run verify-publishable` — stream verdaccio logs.

The gate normally takes 1-2 minutes (build dominates; the verdaccio cycle is ~30s).

## What gets probed

The script holds an authoritative list of packages with an `expectPublic` flag — the same packages release.yml ships to npm. Currently:

- `@silvery/color`
- `@silvery/ansi`
- `@silvery/commander`
- `silvery` (root barrel)

Internal packages (`@silvery/ag`, `@silvery/ag-react`, `@silvery/ag-term`, etc.) are sandbox-published to verdaccio so cross-deps resolve, but are not import-probed — they are bundled into `silvery`'s `dist/` and not consumed directly. To add a new public package, set `expectPublic: true` in `scripts/verify-publishable.ts`.

## Adding a public package

1. Create the package under `packages/<name>/` with `tsdown` build + `publishConfig.exports`.
2. Add `{ dir: "packages/<name>", name: "@silvery/<name>", expectPublic: true }` to `PACKAGES` in `scripts/verify-publishable.ts`.
3. Add a publish step to `release.yml` in the right dependency-order layer.
4. Run `bun run verify-publishable` locally to confirm the gate is happy.

## Release flow

Once `verify-publishable` is green on `main`:

1. Bump `version` in every workspace `package.json` (keep them in lockstep — `release.yml` publishes in dependency order).
2. Commit + tag: `git tag v<version> && git push --tags`.
3. `release.yml` runs: build → verify-publishable gate → publish in dep order → smoke test → GitHub Release.

If the gate fails on a release tag, no packages reach npm — fix the issue, retag.
