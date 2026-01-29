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

// Submodules defined in .gitmodules
const SUBMODULES = [
  "beorn-chalkx",
  "beorn-claude-tools",
  "beorn-flexx",
  "beorn-inkx",
  "beorn-inkx-ui",
  "beorn-logger",
  "beorn-mdtest",
  "beorn-tui-measure",
]

// Known stale submodule entries to clean up
const STALE_SUBMODULES = [
  "vendor/beorn-inkz",
  "vendor/beorn-progressx",
]

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

  // 3. Clean up stale .git/config entries
  log("🧹 Cleaning stale config entries...")
  for (const stale of STALE_SUBMODULES) {
    try {
      await $`git config --remove-section submodule.${stale}`.quiet()
      log(`   ✓ Removed ${stale}`)
    } catch {
      // Entry doesn't exist, that's fine
    }
  }
  log("")

  // 4. Link post-commit hooks to all submodules
  log("🔗 Linking submodule hooks...")
  let changedHooks = 0

  for (const submodule of SUBMODULES) {
    const submodulePath = join(KM_ROOT, "vendor", submodule)

    if (!existsSync(submodulePath)) {
      log(`   ⚠ Skipping ${submodule} (not checked out)`)
      continue
    }

    // Find the actual .git directory (could be a gitdir file)
    const gitPath = join(submodulePath, ".git")
    let hooksDir: string

    if (existsSync(gitPath)) {
      const stat = Bun.file(gitPath)
      if ((await stat.exists()) && (await stat.text()).startsWith("gitdir:")) {
        // It's a gitdir file pointing elsewhere
        const gitdir = (await stat.text()).trim().replace("gitdir: ", "")
        hooksDir = join(submodulePath, gitdir, "hooks")
      } else {
        // It's an actual .git directory
        hooksDir = join(gitPath, "hooks")
      }
    } else {
      log(`   ⚠ Skipping ${submodule} (no .git)`)
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
      log(`   ✓ Linked ${submodule}`)
      changedHooks++
    } catch (e) {
      log(`   ✗ Failed to link ${submodule}: ${e}`)
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

  // 6. Check direnv is allowed for this directory
  if (hasDirenv && existsSync(join(KM_ROOT, ".envrc"))) {
    log("🔐 Checking direnv...")
    const direnvStatus = await $`direnv status`.quiet().nothrow()
    const statusText = direnvStatus.stdout.toString()
    if (statusText.includes("Found RC allowed false")) {
      log("   ⚠ direnv not allowed - running 'direnv allow'...")
      await $`direnv allow ${KM_ROOT}`.quiet().nothrow()
      log("   ✓ direnv allowed\n")
    } else if (statusText.includes("Found RC allowed true")) {
      log("   ✓ direnv already allowed\n")
    } else {
      log("   💡 Run 'direnv allow' to activate the dev environment\n")
    }
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
