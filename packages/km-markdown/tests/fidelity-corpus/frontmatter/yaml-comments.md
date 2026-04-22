---
# Top-level comment explaining this file's purpose
title: YAML with comments
# Tags block — keep in sync with vault/tags.md
tags:
  - fixture     # fixture = testing data, not a real note
  - yaml
  - comments
priority: P3    # P3 = nice-to-have
# TODO: add owner once onboarding completes
owner: null
---

# YAML with comments

YAML supports `#` line comments in frontmatter. Many plugins and humans
leave comments as documentation. A lossless round-trip should preserve them;
if it can't, this fixture goes in `known-drift.ts` with a note.
