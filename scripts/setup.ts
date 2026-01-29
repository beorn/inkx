#!/usr/bin/env bun
/**
 * km monorepo setup script
 *
 * Run with: bun run setup
 * Or:       bun run scripts/setup.ts --quiet
 *
 * Handles:
 * - Prerequisites check (nix, direnv)
 * - Git submodule initialization and update
 * - Submodule hook linking (auto-stage pointer updates)
 * - Cleanup of stale .git/config entries
 * - direnv allow (if needed)
 * - Smoke test (km --version)
 */

import { $ } from "bun"
import { existsSync, lstatSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs"
import { join, resolve } from "node:path"

const QUIET = process.argv.includes("--quiet")
const log = (msg: string) => !QUIET && console.log(msg)

const KM_ROOT = resolve(import.meta.dirname, "..")
const HOOK_SOURCE = join(KM_ROOT, ".githooks/submodule-post-commit")

/**
 * Parse .gitmodules to get list of submodule paths
 */
async function getSubmodulesFromGitmodules(): Promise<string[]> {
  const gitmodulesPath = join(KM_ROOT, ".gitmodules")
  if (!existsSync(gitmodulesPath)) return []

  const content = await Bun.file(gitmodulesPath).text()
  const paths: string[] = []

  for (const line of content.split("\n")) {
    const match = line.match(/^\s*path\s*=\s*(.+)$/)
    if (match) {
      paths.push(match[1].trim())
    }
  }

  return paths
}

/**
 * Get submodule entries from .git/config that aren't in .gitmodules (stale)
 */
async function getStaleSubmoduleConfigs(validPaths: Set<string>): Promise<string[]> {
  const result = await $`git config --local --get-regexp ^submodule\\. `.quiet().nothrow()
  if (result.exitCode !== 0) return []

  const stale = new Set<string>()
  for (const line of result.stdout.toString().split("\n")) {
    // Lines look like: submodule.vendor/beorn-inkz.url git@github.com:...
    const match = line.match(/^submodule\.([^.]+)\./)
    if (match) {
      const path = match[1]
      if (!validPaths.has(path)) {
        stale.add(path)
      }
    }
  }

  return [...stale]
}

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    await $`which ${cmd}`.quiet()
    return true
  } catch {
    return false
  }
}

async function main() {
  log("🔧 km setup\n")

  // 0. Check prerequisites
  log("🔍 Checking prerequisites...")
  const hasNix = await checkCommand("nix")
  const hasDirenv = await checkCommand("direnv")

  if (hasNix) {
    log("   ✓ nix installed")
  } else {
    log("   ⚠ nix not found - install from https://nixos.org/download")
    log("     (needed for reproducible dev environment)")
  }

  if (hasDirenv) {
    log("   ✓ direnv installed")
  } else {
    log("   ⚠ direnv not found - install with: nix profile install nixpkgs#direnv")
    log("     (needed for automatic environment activation)")
  }

  if (hasNix && hasDirenv) {
    // Check if direnv is hooked into shell
    const shellrc = process.env.SHELL?.includes("zsh") ? "~/.zshrc" : "~/.bashrc"
    log(`   💡 Ensure direnv is hooked: eval "$(direnv hook zsh)" in ${shellrc}`)
  }
  log("")

  // 1. Configure git for submodule auto-update
  log("⚙️  Configuring git...")
  await $`git config submodule.recurse true`.quiet()
  log("   ✓ submodule.recurse = true (auto-update on pull/checkout)\n")

  // 2. Initialize and update submodules
  log("📦 Initializing submodules...")
  await $`git submodule init`.quiet()
  await $`git submodule update`.quiet()
  log("   ✓ Submodules initialized\n")

  // 3. Clean up stale .git/config entries (submodules removed from .gitmodules)
  const submodulePaths = await getSubmodulesFromGitmodules()
  const validPathsSet = new Set(submodulePaths)
  const staleConfigs = await getStaleSubmoduleConfigs(validPathsSet)

  if (staleConfigs.length > 0) {
    log("🧹 Cleaning stale config entries...")
    for (const stale of staleConfigs) {
      try {
        await $`git config --remove-section submodule.${stale}`.quiet()
        log(`   ✓ Removed ${stale}`)
      } catch {
        // Entry doesn't exist, that's fine
      }
    }
    log("")
  }

  // 4. Link post-commit hooks to all submodules
  log("🔗 Linking submodule hooks...")
  let changedHooks = 0

  for (const submodulePath of submodulePaths) {
    const fullPath = join(KM_ROOT, submodulePath)
    const submoduleName = submodulePath.split("/").pop() ?? submodulePath

    if (!existsSync(fullPath)) {
      log(`   ⚠ Skipping ${submoduleName} (not checked out)`)
      continue
    }

    // Find the actual .git directory (could be a gitdir file)
    const gitPath = join(fullPath, ".git")
    let hooksDir: string

    if (existsSync(gitPath)) {
      const stat = Bun.file(gitPath)
      if ((await stat.exists()) && (await stat.text()).startsWith("gitdir:")) {
        // It's a gitdir file pointing elsewhere
        const gitdir = (await stat.text()).trim().replace("gitdir: ", "")
        hooksDir = join(fullPath, gitdir, "hooks")
      } else {
        // It's an actual .git directory
        hooksDir = join(gitPath, "hooks")
      }
    } else {
      log(`   ⚠ Skipping ${submoduleName} (no .git)`)
      continue
    }

    const hookTarget = join(hooksDir, "post-commit")

    // Check if already correctly linked
    try {
      const linkTarget = readlinkSync(hookTarget)
      if (linkTarget === HOOK_SOURCE) {
        continue // Already correct, skip
      }
    } catch {
      // Not a symlink or doesn't exist
    }

    // Remove existing hook if it exists
    try {
      unlinkSync(hookTarget)
    } catch {
      // Doesn't exist, fine
    }

    // Create symlink
    try {
      symlinkSync(HOOK_SOURCE, hookTarget)
      log(`   ✓ Linked ${submoduleName}`)
      changedHooks++
    } catch (e) {
      log(`   ✗ Failed to link ${submoduleName}: ${e}`)
    }
  }
  if (changedHooks === 0) {
    log("   ✓ All hooks already linked")
  }
  log("")

  // 5. Install dependencies (skip in quiet mode - assume already done)
  if (!QUIET) {
    log("📥 Installing dependencies...")
    const result = await $`bun install`.nothrow()
    if (result.exitCode === 0) {
      log("   ✓ Dependencies installed\n")
    } else {
      log("   ⚠ bun install failed:\n")
      console.error(result.stderr.toString())
    }
  }

  // 6. Ensure direnv is allowed for this directory
  if (hasDirenv) {
    log("🔐 Allowing direnv...")
    await $`direnv allow .`.cwd(KM_ROOT).quiet().nothrow()
    log("   ✓ direnv allowed\n")
  }

  // 7. Verify CLI works (smoke test)
  if (!QUIET) {
    log("🧪 Verifying installation...")
    const smokeTest = await $`bun km --version`.quiet().nothrow()
    if (smokeTest.exitCode === 0) {
      log("   ✓ km CLI works\n")
    } else {
      log("   ⚠ km CLI test failed - check for errors above\n")
    }
  }

  log("✅ Setup complete!")
}

main().catch((e) => {
  console.error("Setup failed:", e)
  process.exit(1)
})
