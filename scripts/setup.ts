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
import { copyFileSync, existsSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs"
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

/**
 * Backup a file before editing with timestamp
 */
function backupFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = `${filePath}.km-backup-${timestamp}`
  copyFileSync(filePath, backupPath)
  return backupPath
}

async function main() {
  log("🔧 km setup\n")

  // 0. Check prerequisites
  log("🔍 Checking prerequisites...")
  const hasNix = await checkCommand("nix")
  let hasDirenv = await checkCommand("direnv")

  if (hasNix) {
    log("   ✓ nix installed")
  } else {
    console.error("   ✗ nix not found - install from https://nixos.org/download")
    process.exit(1)
  }

  // Ensure nix experimental features are enabled
  const nixConfDir = join(process.env.HOME ?? "", ".config", "nix")
  const nixConfPath = join(nixConfDir, "nix.conf")
  const nixConfContent = existsSync(nixConfPath) ? await Bun.file(nixConfPath).text() : ""
  if (!nixConfContent.includes("experimental-features")) {
    log("   📝 Enabling nix experimental features...")
    if (!existsSync(nixConfDir)) {
      mkdirSync(nixConfDir, { recursive: true })
    }
    if (existsSync(nixConfPath)) {
      backupFile(nixConfPath)
    }
    await Bun.write(nixConfPath, nixConfContent + "\n# Added by km setup\nexperimental-features = nix-command flakes\n")
    log("   ✓ nix.conf updated")
  } else {
    log("   ✓ nix experimental features enabled")
  }

  if (hasDirenv) {
    log("   ✓ direnv installed")
  } else {
    log("   ⚠ direnv not found - installing with nix...")
    const installDirenv = await $`nix profile add nixpkgs#direnv`.quiet().nothrow()
    if (installDirenv.exitCode !== 0) {
      console.error("   ✗ Failed to install direnv")
      console.error(installDirenv.stderr.toString())
      process.exit(1)
    }
    hasDirenv = await checkCommand("direnv")
    if (!hasDirenv) {
      console.error("   ✗ direnv installed but not in PATH - restart your shell")
      process.exit(1)
    }
    log("   ✓ direnv installed")
  }

  // Check if direnv is hooked into shell and add if not
  const shell = process.env.SHELL?.includes("zsh") ? "zsh" : "bash"
  const shellrc = shell === "zsh" ? join(process.env.HOME ?? "", ".zshrc") : join(process.env.HOME ?? "", ".bashrc")
  const omzDir = join(process.env.HOME ?? "", ".oh-my-zsh")
  const hasOmz = shell === "zsh" && existsSync(omzDir)

  const shellrcContent = existsSync(shellrc) ? await Bun.file(shellrc).text() : ""

  // Track if we need to edit
  let needsEdit = false
  if (hasOmz) {
    needsEdit = !(shellrcContent.includes("direnv") && shellrcContent.includes("plugins="))
  } else {
    needsEdit = !shellrcContent.includes("direnv hook")
  }

  // Backup before editing
  if (needsEdit && existsSync(shellrc)) {
    const backupPath = backupFile(shellrc)
    if (backupPath) {
      log(`   📋 Backed up to ${backupPath}`)
    }
  }

  if (hasOmz) {
    // Oh My Zsh: add direnv to plugins list
    if (shellrcContent.includes("direnv") && shellrcContent.includes("plugins=")) {
      log("   ✓ direnv omz plugin already configured")
    } else {
      // Find plugins=(...) and add direnv
      const pluginsMatch = shellrcContent.match(/^plugins=\(([^)]*)\)/m)
      if (pluginsMatch) {
        const currentPlugins = pluginsMatch[1].trim()
        const newPlugins = currentPlugins ? `${currentPlugins} direnv` : "direnv"
        const newContent = shellrcContent.replace(
          /^plugins=\([^)]*\)/m,
          `plugins=(${newPlugins})`
        )
        log(`   📝 Adding direnv to omz plugins in ${shellrc}...`)
        await Bun.write(shellrc, newContent)
        log("   ✓ direnv omz plugin added (restart shell or run: source " + shellrc + ")")
      } else {
        // No plugins line found, add manual hook as fallback
        const hookLine = `eval "$(direnv hook ${shell})"`
        log(`   📝 Adding direnv hook to ${shellrc}...`)
        await Bun.write(shellrc, shellrcContent + `\n# Added by km setup\n${hookLine}\n`)
        log("   ✓ direnv hook added (restart shell or run: source " + shellrc + ")")
      }
    }
  } else {
    // No omz: use manual hook
    const hookLine = `eval "$(direnv hook ${shell})"`
    if (!shellrcContent.includes("direnv hook")) {
      log(`   📝 Adding direnv hook to ${shellrc}...`)
      await Bun.write(shellrc, shellrcContent + `\n# Added by km setup\n${hookLine}\n`)
      log("   ✓ direnv hook added (restart shell or run: source " + shellrc + ")")
    } else {
      log("   ✓ direnv hook already configured")
    }
  }
  log("")

  // 1. Configure git for submodule auto-update
  log("⚙️  Configuring git...")
  const gitConfig = await $`git config submodule.recurse true`.quiet().nothrow()
  if (gitConfig.exitCode !== 0) {
    console.error("   ✗ Failed to configure git - are you in a git repository?")
    process.exit(1)
  }
  log("   ✓ submodule.recurse = true (auto-update on pull/checkout)\n")

  // 2. Initialize and update submodules
  log("📦 Initializing submodules...")
  const submoduleInit = await $`git submodule init`.quiet().nothrow()
  if (submoduleInit.exitCode !== 0) {
    console.error("   ✗ Failed to initialize submodules")
    console.error(submoduleInit.stderr.toString())
    process.exit(1)
  }
  const submoduleUpdate = await $`git submodule update`.quiet().nothrow()
  if (submoduleUpdate.exitCode !== 0) {
    console.error("   ✗ Failed to update submodules")
    console.error(submoduleUpdate.stderr.toString())
    process.exit(1)
  }
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

    // Ensure hooks directory exists
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true })
    }

    // Create symlink
    try {
      symlinkSync(HOOK_SOURCE, hookTarget)
      log(`   ✓ Linked ${submoduleName}`)
      changedHooks++
    } catch (e) {
      console.error(`   ✗ Failed to link ${submoduleName}: ${e}`)
      process.exit(1)
    }
  }
  if (changedHooks === 0) {
    log("   ✓ All hooks already linked")
  }
  log("")

  // 5. Install dependencies
  log("📥 Installing dependencies...")
  const bunInstall = await $`bun install`.nothrow()
  if (bunInstall.exitCode !== 0) {
    console.error("   ✗ bun install failed:")
    console.error(bunInstall.stderr.toString())
    process.exit(1)
  }
  log("   ✓ Dependencies installed\n")

  // 6. Ensure direnv is allowed for this directory
  log("🔐 Allowing direnv...")
  const direnvAllow = await $`direnv allow .`.cwd(KM_ROOT).quiet().nothrow()
  if (direnvAllow.exitCode !== 0) {
    console.error("   ✗ direnv allow failed")
    console.error(direnvAllow.stderr.toString())
    process.exit(1)
  }
  log("   ✓ direnv allowed\n")

  // 7. Verify CLI works (smoke test)
  log("🧪 Verifying installation...")
  const smokeTest = await $`bun km --version`.quiet().nothrow()
  if (smokeTest.exitCode !== 0) {
    log("   ⚠ km CLI test failed (may need shell restart for direnv)")
    log("   Error: " + smokeTest.stderr.toString().trim())
    log("")
    log("✅ Setup complete! Restart your shell, then run: bun km --version")
  } else {
    log("   ✓ km CLI works\n")
    log("✅ Setup complete!")
  }
}

main().catch((e) => {
  console.error("Setup failed:", e)
  process.exit(1)
})
