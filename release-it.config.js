import { createReleaseConfig } from "@km/infra/release-it"

export default createReleaseConfig({
  hooks: {
    "after:bump": "bun run build:info",
    "after:git:push":
      "awk '/^## ${version}/{found=1; print; next} /^## [0-9]/{if(found) exit} found' CHANGELOG.md | gh release create v${version} --title 'v${version}' --notes-file -",
  },
})
