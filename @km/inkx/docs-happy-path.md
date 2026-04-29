---
id: "@km/inkx/docs-happy-path"
aliases:
  - km-inkx.docs-happy-path
  - km-inkx-docs-happy-path
created_at: 2026-02-06T15:46:44Z
closed_at: 2026-02-11T18:36:09Z
---

# [x] Lead docs with run() as the recommended approach @km/inkx #feature #P4

Three runtime layers (createRuntime, run, createApp) can overwhelm newcomers. Lead with run() as the default happy path, frame createApp as advanced, createRuntime as escape hatch. Getting-started should build first app with run() only.