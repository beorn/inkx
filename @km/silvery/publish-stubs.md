---
id: "@km/silvery/publish-stubs"
aliases:
  - km-silvery.publish-stubs
  - km-silvery-publish-stubs
created_by: claude:55df8ef1
created_at: 2026-03-09T18:22:32Z
closed_at: 2026-03-09T18:39:19Z
close_reason: "Published 3 stub packages to npm: silvery@0.0.1,
  @silvery/react@0.0.1, loggily@0.0.1 (renamed from omlog — npm blocked it for
  similarity to npmlog/tslog). Pipeline validated with granular access token
  (bypass 2FA). All verified on registry."
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Publish silvery + omlog stub packages to npm (validate pipeline) @km/silvery #task #P2 @claude:55df8ef1

Publish minimal stub packages to npm early to validate the full publish pipeline before the monolith split.

## Packages to publish

1. **silvery** (0.0.1) — placeholder with README pointing to silvery.dev, description of what's coming
2. **omlog** (0.0.1) — placeholder, reserves the name

## Goals

- Verify npm auth, org permissions, publish flow
- Reserve bare package names before someone else takes them
- Establish the package metadata (description, keywords, homepage, repo URL)
- Validate scoped publishes work: also publish a stub @silvery/react (0.0.1)

## What to publish

Minimal packages with:
- `package.json` (name, version, description, keywords, license, homepage, repository)
- `README.md` ("Coming soon — see silvery.dev")
- `src/index.ts` with `export {}` or a version constant

## Checklist

- [ ] `npm publish silvery` (bare)
- [ ] `npm publish @silvery/react` (scoped — tests org access)
- [ ] `npm publish omlog` (bare)
- [ ] Verify all three appear on npmjs.com
- [ ] Verify `npm info silvery` returns correct metadata

## Notes

Do this BEFORE the monolith split (@km/_orphan/w297c). It's a pipeline validation — if publishing is broken, better to find out now than after splitting 10 packages.