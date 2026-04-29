---
id: "@km/flexx/npm-publish"
aliases:
  - km-flexx.npm-publish
  - km-flexx-npm-publish
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:19Z
closed_at: 2026-03-09T22:07:27Z
close_reason: "Grooming: already published as flexily"
---

# [x] Publish flexture to npm @km/flexx #task #P4

Publish flexture to npm as a public package.

## Checklist
- [ ] Verify package.json: name, version, description, keywords, repository, homepage, bugs, license, author
- [ ] Set up npm account / org scope (@beorn)
- [ ] Add .npmignore or package.json "files" field (exclude tests, bench, docs from published package)
- [ ] Verify exports map (main, module, types) works correctly
- [ ] Test: npm pack --dry-run to verify contents
- [ ] Publish: npm publish --access public
- [ ] Verify installation: npm install flexture in a fresh project
- [ ] Add npm badge to README

## Current state
- package.json has name "flexture", version "0.1.0"
- MIT license, 1 runtime dep (debug), 3 dev deps