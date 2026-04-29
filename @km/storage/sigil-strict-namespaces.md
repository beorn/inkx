---
id: "@km/storage/sigil-strict-namespaces"
aliases:
  - km-storage.sigil-strict-namespaces
  - km-storage-sigil-strict-namespaces
created_by: Bjørn Stabell
created_at: 2026-04-14T05:02:44Z
closed_at: 2026-04-16T23:17:49Z
close_reason: "Folded into km-storage.link-model-canonical (2026-04-16). Sigil
  is part of the node name, not a separate namespace: '@Alice', '#urgent',
  '+cleanup' are distinct node names. Serialization picks form from target name
  prefix. No separate config, no MdForm variants, no cross-namespace
  unification. Strict namespaces fall out from name uniqueness.
  ~/.config/km/config.yml not needed for v1."
---

# [x] Sigils form strict namespaces (no cross-sigil unification) @km/storage #feature #P1 #link-graph #parser #resolver #sigils #strict-namespaces

blocks:: [[@km/storage/sigils]]

Ensure km's parser, link resolver, and link graph treat each sigil as its own namespace. +km, @km, #km, [[km]], and ~km must resolve to FIVE DISTINCT targets, not one unified target. Departure from current ~km/docs/design/links.md model. See ~vault/projects/+km/design/repo-model-and-sigils.md for the full strict-namespace spec.