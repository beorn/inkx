/**
 * Release-it configuration factory for km monorepo.
 *
 * Usage:
 *   import { createReleaseConfig } from "@km/infra/release-it"
 *   export default createReleaseConfig({
 *     "after:bump": "bun run build:info",
 *     "after:git:push": "gh release create ..."
 *   })
 */

export interface ReleaseHooks {
  "before:init"?: string
  "after:init"?: string
  "before:bump"?: string
  "after:bump"?: string
  "before:git:push"?: string
  "after:git:push"?: string
  "before:release"?: string
  "after:release"?: string
}

export interface ReleaseConfigOptions {
  /**
   * Custom hooks to run at various release stages
   */
  hooks?: ReleaseHooks

  /**
   * Git tag name template. Default: "v${version}"
   */
  tagName?: string

  /**
   * Git commit message template. Default: "chore(release): v${version}"
   */
  commitMessage?: string

  /**
   * Branch required for releases. Default: "main"
   */
  requireBranch?: string

  /**
   * Whether to create GitHub releases. Default: false
   */
  githubRelease?: boolean

  /**
   * Whether to publish to npm. Default: false
   */
  npmPublish?: boolean

  /**
   * Changelog preset. Default: "conventionalcommits"
   */
  changelogPreset?: string
}

/**
 * Creates a release-it configuration with conventional changelog support.
 *
 * Features:
 * - Conventional commits changelog generation
 * - Git tag and commit with configurable templates
 * - Hook system for custom actions
 */
export function createReleaseConfig(options: ReleaseConfigOptions = {}) {
  const {
    hooks = {},
    tagName = "v${version}",
    commitMessage = "chore(release): v${version}",
    requireBranch = "main",
    githubRelease = false,
    npmPublish = false,
    changelogPreset = "conventionalcommits",
  } = options

  return {
    git: {
      commitMessage,
      tagName,
      requireCleanWorkingDir: true,
      requireBranch,
    },
    github: {
      release: githubRelease,
    },
    npm: {
      publish: npmPublish,
    },
    plugins: {
      "@release-it/conventional-changelog": {
        preset: changelogPreset,
        infile: "CHANGELOG.md",
      },
    },
    hooks,
  }
}
