---
id: "@km/inkx/npm-publish"
aliases:
  - km-inkx.npm-publish
  - km-inkx-npm-publish
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:22Z
closed_at: 2026-03-09T22:07:20Z
close_reason: "Grooming: superseded by km-silvery.publish-1.0 (hightea → silvery)"
---

# [x] Publish hightea to npm @km/inkx #task #P4

Publish hightea to npm as a public package.

## Checklist
- [ ] Decide package name: @hightea/term vs hightea (check availability)
- [ ] Verify package.json: name, version, description, keywords, repository, homepage, bugs, license, author
- [ ] Set up .npmignore or "files" field (exclude tests, examples, docs/site from published package)
- [ ] Verify exports map works correctly for all entry points
- [ ] Verify peer dependencies (react, react-reconciler) are correctly declared
- [ ] Test: npm pack --dry-run to verify contents and size
- [ ] Publish: npm publish --access public
- [ ] Verify installation in a fresh project
- [ ] Add npm badge to README

## Current state
- package.json has name "@hightea/term", version "0.1.0"