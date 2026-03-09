# Repo Health Templates

Standard templates for common package files. Copy and adapt as needed.

## .gitignore — TypeScript Library

```gitignore
# Dependencies
node_modules/

# Build output
dist/

# Test & coverage
coverage/

# Logs
*.log

# OS
.DS_Store

# Package archives
*.tgz

# Lockfile (use text bun.lock, not binary)
bun.lockb
```

### VitePress addition (append if docs/ uses VitePress)

```gitignore
# VitePress
docs/.vitepress/dist
docs/.vitepress/cache
```

## LICENSE — MIT

```
MIT License

Copyright (c) <YEAR> <AUTHOR>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Placeholders**:
- `<YEAR>`: Year of first commit (`git log --reverse --format=%ai | head -1 | cut -d- -f1`)
- `<AUTHOR>`: From package.json `author` field, or git log author

## GitHub Actions — Deploy VitePress Docs

```yaml
name: Deploy docs

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - run: bun docs:build

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist

      - uses: actions/deploy-pages@v4
        id: deployment
```

**Notes**:
- Requires GitHub Pages enabled in repo settings (Source: GitHub Actions)
- `bun docs:build` assumes `package.json` has a `docs:build` script (typically `vitepress build docs`)
- For monorepo subpackages, adjust the `path` in upload-pages-artifact

## VitePress Config Skeleton

```ts
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "<PACKAGE_NAME>",
  description: "<DESCRIPTION>",
  base: "/<REPO_NAME>/",
  themeConfig: {
    nav: [{ text: "Guide", link: "/guide/" }],
    sidebar: [
      {
        text: "Guide",
        items: [{ text: "Getting Started", link: "/guide/" }],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/<OWNER>/<REPO>" },
    ],
  },
});
```

**Placeholders**:
- `<PACKAGE_NAME>`: Display name
- `<DESCRIPTION>`: One-line description from package.json
- `<REPO_NAME>`: GitHub repo name (for `base` path)
- `<OWNER>/<REPO>`: GitHub owner/repo
