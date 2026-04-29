---
id: "@km/_orphan/test-vendor"
aliases:
  - km-test-vendor
created_at: 2026-01-27T19:27:33Z
closed_at: 2026-01-27T19:31:09Z
---

# [x] Set up test:vendor for Node.js runtime testing @km/_orphan #task #P1 @claude:5df0e9da

CI tests fail with Node.js but pass with Bun. Need a test:vendor script that runs vendor/**/*.{spec,test}.ts* with Node.js runtime to catch these issues locally before push.