#!/usr/bin/env bun
import { readSync } from "node:fs"
import { Command } from "commander"
import pc from "picocolors"
import {
  getAccounts,
  getAccount,
  upsertAccount,
  removeAccount,
  renameAccount,
  getActiveAccount,
  setActiveAccount,
} from "./config.ts"
import { readCredential, writeCredential, deleteCredential, renameCredential } from "./credentials.ts"
import { readKeychainCredential } from "./keychain.ts"
import { checkAllQuotas, findBestAccount } from "./quota.ts"
import { switchAccount } from "./switcher.ts"
import { formatStatus } from "./display.ts"
import { fetchClaudeProfile } from "./providers/claude-oauth.ts"
import type { AccountProvider } from "./types.ts"

const program = new Command()

program.name("accountly").description("Multi-account manager for Claude Code and other AI providers").version("0.1.0")

// ── status ──────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show all accounts with quota usage")
  .action(async () => {
    const accounts = getAccounts()
    const active = getActiveAccount()
    const quotas = await checkAllQuotas(accounts)
    console.log(formatStatus(quotas, active, accounts))
  })

// ── import ──────────────────────────────────────────────────────────────
program
  .command("import")
  .description("Import current Claude Code credentials (uses email as account name)")
  .action(async () => {
    const credential = readKeychainCredential()
    if (!credential) {
      console.error(pc.red("No Claude Code credentials found in Keychain."))
      console.error(pc.dim("Log in with Claude Code first, then run this command."))
      process.exit(1)
    }

    // Fetch profile — email becomes the account name
    const profile = await fetchClaudeProfile(credential)
    if (!profile?.email) {
      console.error(pc.red("Could not fetch account profile. Is the token still valid?"))
      process.exit(1)
    }

    const accountName = profile.email
    const metadata: Record<string, string> = {
      email: profile.email,
    }
    if (profile.fullName) metadata.name = profile.fullName
    if (profile.orgName) metadata.org = profile.orgName
    if (profile.plan) metadata.plan = profile.plan

    const existing = getAccount(accountName)
    writeCredential(accountName, credential)
    upsertAccount({ name: accountName, provider: "claude-oauth", metadata })
    setActiveAccount(accountName)

    if (existing) {
      console.log(pc.green(`Refreshed credentials for ${accountName}`))
    } else {
      console.log(pc.green(`Imported ${accountName}`))
      if (profile.orgName) console.log(pc.dim(`  Org: ${profile.orgName} (${profile.plan})`))
    }
    console.log(pc.dim(`Active account: ${accountName}`))
  })

// ── switch ──────────────────────────────────────────────────────────────
program
  .command("switch <name>")
  .description("Switch active Claude Code account")
  .action((name: string) => {
    const result = switchAccount(name)
    if (result.success) {
      console.log(pc.green(`Switched to "${name}". New Claude Code sessions will use this account.`))
    } else {
      console.error(pc.red(`Failed to switch: ${result.error}`))
      process.exit(1)
    }
  })

// ── auto ────────────────────────────────────────────────────────────────
program
  .command("auto")
  .description("Auto-switch to account with most remaining quota")
  .action(async () => {
    const accounts = getAccounts().filter((a) => a.provider === "claude-oauth" && !a.disabled)
    if (accounts.length === 0) {
      console.error(pc.red("No Claude OAuth accounts configured."))
      process.exit(1)
    }

    console.log(pc.dim("Checking quotas..."))
    const quotas = await checkAllQuotas(accounts)
    const best = findBestAccount(quotas)

    if (!best) {
      console.error(pc.red("No accounts with available quota."))
      // Show what we found
      for (const q of quotas) {
        if (q.error) {
          console.error(pc.dim(`  ${q.accountName}: ${q.error}`))
        } else {
          console.error(pc.dim(`  ${q.accountName}: all windows exhausted`))
        }
      }
      process.exit(1)
    }

    const active = getActiveAccount()
    if (best.accountName === active) {
      console.log(pc.green(`Already on best account: "${best.accountName}"`))
      return
    }

    const result = switchAccount(best.accountName)
    if (result.success) {
      console.log(pc.green(`Switched to "${best.accountName}" (lowest utilization)`))
    } else {
      console.error(pc.red(`Failed to switch: ${result.error}`))
      process.exit(1)
    }
  })

// ── add ─────────────────────────────────────────────────────────────────
program
  .command("add <name>")
  .description("Add an account manually")
  .requiredOption("-p, --provider <provider>", "Provider type (claude-oauth, anthropic-api, openai, google)")
  .option("--key", "Prompt for API key")
  .option("--env <var>", "Environment variable containing the API key")
  .action((name: string, opts: { provider: string; key?: boolean; env?: string }) => {
    const provider = opts.provider as AccountProvider
    upsertAccount({ name, provider })

    if (opts.env) {
      const apiKey = process.env[opts.env]
      if (!apiKey) {
        console.error(pc.red(`Environment variable ${opts.env} is not set`))
        process.exit(1)
      }
      writeCredential(name, { apiKey })
    } else if (opts.key) {
      // Read from stdin
      console.log("Enter API key (paste, then press Enter):")
      const key = readlineSync()
      if (key) {
        writeCredential(name, { apiKey: key })
      }
    }

    console.log(pc.green(`Added account "${name}" (${provider})`))
  })

// ── rename ──────────────────────────────────────────────────────────────
program
  .command("rename <old-name> <new-name>")
  .description("Rename an account")
  .action((oldName: string, newName: string) => {
    const account = getAccount(oldName)
    if (!account) {
      console.error(pc.red(`Account "${oldName}" not found`))
      process.exit(1)
    }
    if (getAccount(newName)) {
      console.error(pc.red(`Account "${newName}" already exists`))
      process.exit(1)
    }

    renameCredential(oldName, newName)
    renameAccount(oldName, newName)
    console.log(pc.green(`Renamed "${oldName}" → "${newName}"`))
  })

// ── remove ──────────────────────────────────────────────────────────────
program
  .command("remove <name>")
  .description("Remove an account")
  .action((name: string) => {
    const account = getAccount(name)
    if (!account) {
      console.error(pc.red(`Account "${name}" not found`))
      process.exit(1)
    }

    removeAccount(name)
    deleteCredential(name)
    console.log(pc.green(`Removed account "${name}"`))
  })

// ── get-token ───────────────────────────────────────────────────────────
program
  .command("get-token")
  .description("Output the active access token (for apiKeyHelper integration)")
  .option("-p, --provider <provider>", "Provider filter")
  .action((opts: { provider?: string }) => {
    const active = getActiveAccount()
    if (!active) {
      console.error(pc.red("No active account"))
      process.exit(1)
    }

    const account = getAccount(active)
    if (!account) {
      console.error(pc.red(`Active account "${active}" not found in config`))
      process.exit(1)
    }

    if (opts.provider && account.provider !== opts.provider) {
      console.error(pc.red(`Active account is ${account.provider}, not ${opts.provider}`))
      process.exit(1)
    }

    const cred = readCredential(active)
    if (!cred) {
      console.error(pc.red("No credentials found for active account"))
      process.exit(1)
    }

    // Output the token (handles claudeAiOauth wrapper, direct accessToken, or apiKey)
    const oauth = cred.claudeAiOauth as Record<string, unknown> | undefined
    const token = (oauth?.accessToken as string) ?? (cred.accessToken as string) ?? (cred.apiKey as string)
    if (!token) {
      console.error(pc.red("No token found in credentials"))
      process.exit(1)
    }

    // Output just the token, no newline formatting
    process.stdout.write(token)
  })

function readlineSync(): string | undefined {
  try {
    const buf = Buffer.alloc(4096)
    const n = readSync(0, buf)
    return buf.toString("utf-8", 0, n).trim()
  } catch {
    return undefined
  }
}

program.parse()
