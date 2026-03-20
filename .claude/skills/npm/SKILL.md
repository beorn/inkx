---
description: "Check npm package and org scope availability. Use when exploring package names, reserving npm names, or checking if a scope/package exists."
argument-hint: "<names...>"
allowed-tools: Bash
---

# npm — Package Name Availability

**Keywords**: npm, package name, availability, scope, org, registry, reserve, check name, naming

Check whether npm package names, scoped packages, and org scopes are available.

## Quick Check

```bash
# Packages and org scopes — bunx npm-name-cli is the primary tool
bunx npm-name-cli mypackage @myorg anotherpackage

# Scoped packages (check if a specific @scope/name is taken)
curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/@SCOPE%2FNAME"
# 404 = available, 200 = taken
```

## Tools

### `bunx npm-name-cli` (primary)

Sindresorhus's CLI. Checks both packages AND org scope ownership.

```bash
bunx npm-name-cli steeply @leafy chahai
# ✔ steeply is available
# ✖ @leafy is unavailable (org exists)
# ✔ chahai is available
```

**Handles**: exact name lookup, org scope ownership detection.
**Does NOT handle**: similarity blocking (see below).

**Reliability caveat**: "available" is *usually* right but not guaranteed — some scopes that show available can't actually be registered (e.g., `@earthy` showed available but registration failed). "Failed to check" is ambiguous (could be taken or timeout). **Only `npm org create` confirms true availability.** Treat npm-name-cli results as a filter, not a guarantee.

### curl (for scoped packages)

`npm-name-cli` doesn't check `@scope/name` pairs — only bare names and `@scope` orgs. Use curl for scoped:

```bash
for scope in leafy steeply chahai; do
  echo -n "@$scope/tea: "
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/@${scope}%2Ftea")
  [ "$code" = "404" ] && echo "available" || echo "taken"
done
```

## Similarity Blocking (the hard problem)

npm rejects names "confusingly similar" to existing packages at **publish time only**. No API or CLI can check this in advance.

**How it works**: npm normalizes names by stripping `-`, `.`, `_`. If the normalized form matches an existing package, publish is rejected.

**Known examples**:
- `silvery` → available (hightea was blocked by `high-tea`, silvery is the replacement)
- `omlog` → blocked by similarity to `npmlog`

**Manual variant check** (best effort — catches hyphenated collisions):

```bash
bash -c '
check_variants() {
  local name="$1"
  local len=${#name}
  for ((i=1; i<len; i++)); do
    local variant="${name:0:i}-${name:i}"
    local code=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/$variant")
    if [ "$code" = "200" ]; then
      echo "$name: BLOCKED by $variant"
      return
    fi
  done
  echo "$name: no hyphenated conflicts found"
}
check_variants "mypackage"
'
```

**Scoped packages bypass similarity** — `@myorg/log` publishes fine even though `log` exists.

## Procedure

1. Run `bunx npm-name-cli` with all candidate names and org scopes
2. For available bare names, run the variant check to catch similarity blocks
3. For scoped packages, use curl to check `@scope/name`
4. Present results:

```
Name             Package    Org Scope    Variants
─────────────────────────────────────────────────
steeply          available  available    clean
chahai           available  available    clean
silvery          available  available    clean
@leafy           -          taken        -
```

## Reserving / Squatting Names

To hold a name for future use, publish a minimal placeholder and deprecate it:

```bash
# 1. Publish empty placeholder
dir="/tmp/npm-reserve-$name"
mkdir -p "$dir"
printf '{"name":"%s","version":"0.0.0","description":"Placeholder — not yet published.","author":"Bjørn Stabell <bjorn@stabell.org>","license":"MIT"}\n' "$name" > "$dir/package.json"
(cd "$dir" && npm publish --access public)

# 2. Deprecate so installers get a warning
npm deprecate "$name@0.0.0" "Placeholder — not yet published."

# 3. Later, un-deprecate when publishing a real version
npm deprecate "$name@*" ""
```

**Always deprecate placeholders** — it signals the package is intentionally empty, not abandoned. Without deprecation, npm may eventually reclaim unused packages.

**Cannot squat without publishing** — npm requires a published tarball to hold the name. Unpublished names are released after 24 hours.

## Tips

- **Scoped packages are safest** — no similarity blocking, no squatting risk
- **npm-name-cli says available ≠ publishable** — it doesn't catch similarity blocks
- **Org scopes are first-come**: create with `npm org create` to reserve
- **Deprecate placeholders** — `npm deprecate "pkg@*" "Placeholder"` on anything you're just holding

## Disputes (hard)

npm's [dispute policy](https://docs.npmjs.com/policies/disputes) exists but is difficult in practice:

- **Trademark required**: npm strongly favors trademark holders. Without a registered trademark, disputes rarely succeed.
- **Squatted packages** (empty/placeholder): npm *can* transfer these, but the process is slow and inconsistent. File via `npm support` with evidence the package is abandoned.
- **Org scopes**: even harder to dispute than packages. There's no "abandoned org" policy — if someone created it, they own it.
- **Timeline**: weeks to months. No guarantee of success.
- **Practical advice**: if the name you want is taken, pick a different name. Disputes are a last resort for names you have trademark rights to, not a general-purpose mechanism.
- **What works better**: use a scoped package under an org you create (`@yourorg/name`). This sidesteps all name conflicts entirely.
