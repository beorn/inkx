import { readCredential, writeCredential } from "./credentials.ts"
import { writeKeychainCredential } from "./keychain.ts"
import { getAccount, setActiveAccount } from "./config.ts"
import { ensureFreshOAuth } from "./providers/claude-oauth.ts"

export interface SwitchResult {
  success: boolean
  accountName: string
  error?: string
}

/** Switch the active Claude Code account by writing to Keychain. Auto-refreshes expired tokens. */
export async function switchAccount(name: string): Promise<SwitchResult> {
  const account = getAccount(name)
  if (!account) {
    return { success: false, accountName: name, error: "Account not found" }
  }

  if (account.provider !== "claude-oauth") {
    return {
      success: false,
      accountName: name,
      error: "Only claude-oauth accounts can be switched via Keychain",
    }
  }

  let credential = readCredential(name)
  if (!credential) {
    return {
      success: false,
      accountName: name,
      error: "No credentials found for this account",
    }
  }

  // Auto-refresh expired tokens before switching
  const fresh = await ensureFreshOAuth(credential, (updated) => {
    writeCredential(name, updated)
  })
  if (fresh) credential = fresh

  try {
    writeKeychainCredential(credential)
    setActiveAccount(name)
    return { success: true, accountName: name }
  } catch (err) {
    return {
      success: false,
      accountName: name,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
